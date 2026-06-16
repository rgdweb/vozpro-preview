"""
OmniVoice GPU Server
====================
Endpoints:
  POST /api/gerar           - FormData (gerador.html)
  POST /api/native-generate - JSON (VozPro via tunnel)
  POST /api/echo            - Diagnostico
  GET  /                    - Status

Pipeline: modelo gera float -> clip -> int16 (uma unica conversao)
"""

import os, sys, time, io as _io, wave, base64, tempfile, json, urllib.request
import gc as _gc
import threading
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
import torch
from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

PORT = 8000
_gen_counter = 0
_gen_counter_lock = threading.Lock()

print("Carregando OmniVoice na GPU...")
from omnivoice import OmniVoice, OmniVoiceGenerationConfig

model = OmniVoice.from_pretrained(
    "k2-fsa/OmniVoice",
    device_map="cuda", dtype=torch.float16,
    load_asr=True, token=False,
)
sampling_rate = model.sampling_rate
print(f"Modelo carregado! SR={sampling_rate}Hz, GPU={torch.cuda.get_device_name(0)}")


# ============================================================
# SISTEMA DE LIMPEZA DE CACHE GPU
# ============================================================

def _get_vram():
    """Retorna (allocated_gb, reserved_gb, percent)."""
    if not torch.cuda.is_available():
        return 0.0, 0.0, 0.0
    total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    reserv = torch.cuda.memory_reserved(0) / (1024**3)
    alloc = torch.cuda.memory_allocated(0) / (1024**3)
    return alloc, reserv, round((reserv / total) * 100, 1) if total > 0 else 0


def _smart_cleanup(label=""):
    """Cleanup inteligente: gc.collect + empty_cache (2x)."""
    if not torch.cuda.is_available():
        return 0
    _gc.collect()
    torch.cuda.empty_cache()
    time.sleep(0.5)
    _gc.collect()
    torch.cuda.empty_cache()
    _, reserv, _ = _get_vram()
    if label:
        print(f"[GPU-{label}] Cleanup feito: {reserv:.2f}GB reservado")
    return reserv


def _deep_cleanup(label="Deep"):
    """Deep cleanup: 3 passadas com delays para liberar VRAM fragmentada."""
    if not torch.cuda.is_available():
        return
    print(f"[GPU-{label}] Deep cleanup iniciado...")
    for i in range(3):
        _gc.collect()
        torch.cuda.empty_cache()
        if i < 2:
            time.sleep(1)
    _, reserv, pct = _get_vram()
    print(f"[GPU-{label}] Deep cleanup finalizado: {reserv:.2f}GB reservado ({pct:.0f}%)")


def _background_monitor(interval=180):
    """Thread de fundo: verifica VRAM periodicamente e limpa se necessario."""
    time.sleep(30)
    while True:
        try:
            time.sleep(interval)
            _, reserv, pct = _get_vram()
            if pct > 70:
                print(f"[GPU-Monitor] VRAM em {pct:.0f}% ({reserv:.2f}GB) — cleanup automatico")
                _smart_cleanup("Monitor")
                _, reserv2, pct2 = _get_vram()
                if pct2 > 85:
                    print(f"[GPU-Monitor] Ainda alto ({pct2:.0f}%) — deep cleanup")
                    _deep_cleanup("Monitor")
            else:
                print(f"[GPU-Monitor] VRAM OK: {pct:.0f}% ({reserv:.2f}GB reservado)")
        except Exception as e:
            print(f"[GPU-Monitor] Erro: {e}")


def _pre_generate_cleanup():
    """Cleanup antes de gerar se VRAM estiver alta."""
    if not torch.cuda.is_available():
        return
    alloc, reserv, pct = _get_vram()
    print(f"[GPU] Antes geracao: {alloc:.2f}GB alloc / {reserv:.2f}GB reserv ({pct:.0f}%)")
    if pct > 80:
        print(f"[GPU] VRAM alta ({pct:.0f}%) — cleanup antes de gerar")
        _smart_cleanup("Pre")
        _, reserv2, pct2 = _get_vram()
        if pct2 > 90:
            print(f"[GPU] VRAM critica ({pct2:.0f}%) — deep cleanup")
            _deep_cleanup("Pre")
    else:
        torch.cuda.empty_cache()


def _post_generate_cleanup():
    """Cleanup depois de gerar + deep cleanup a cada 5 geracoes."""
    global _gen_counter
    if not torch.cuda.is_available():
        return
    _smart_cleanup("Pos")
    with _gen_counter_lock:
        _gen_counter += 1
        count = _gen_counter
        if _gen_counter >= 5:
            _gen_counter = 0
            _deep_cleanup("Auto5")
    _, reserv, pct = _get_vram()
    print(f"[GPU] Apos geracao #{count}: {reserv:.2f}GB ({pct:.0f}%)")


# ============================================================
# FIM DO SISTEMA DE LIMPEZA GPU
# ============================================================


# ============================================================
# PRE-PROCESSAMENTO DE VOZES GRAVES (simples)
# ============================================================

def _detect_pitch(audio, sr, frame_ms=30):
    """Detecta pitch medio via autocorrelacao."""
    frame_size = int(sr * frame_ms / 1000)
    hop = frame_size // 2
    pitches = []
    for i in range(0, len(audio) - frame_size, hop):
        frame = audio[i:i + frame_size]
        frame = frame - np.mean(frame)
        corr = np.correlate(frame, frame, mode='full')
        corr = corr[len(corr) // 2:]
        min_lag = int(sr / 400)
        max_lag = min(int(sr / 60), len(corr) - 1)
        if max_lag <= min_lag:
            continue
        search = corr[min_lag:max_lag]
        if len(search) == 0 or np.max(search) <= 0:
            continue
        peak_idx = np.argmax(search) + min_lag
        pitch = sr / peak_idx
        if 60 < pitch < 400:
            pitches.append(pitch)
    return np.median(pitches) if pitches else 0


def _process_deep_voice(ref_path):
    """Se pitch < 90Hz, aplica pitch shift +1.5 semitons + normaliza."""
    try:
        sr, data = wavfile.read(ref_path)
    except Exception as e:
        print(f"  [VOICE] Erro ao ler ref: {e}")
        return ref_path

    if data.dtype == np.int16:
        audio = data.astype(np.float64) / 32767.0
    elif data.dtype == np.int32:
        audio = data.astype(np.float64) / 2147483647.0
    else:
        audio = data.astype(np.float64) / (np.max(np.abs(data)) + 1e-8)

    if len(audio.shape) > 1:
        audio = np.mean(audio, axis=1)

    avg_pitch = _detect_pitch(audio, sr)

    if avg_pitch == 0 or avg_pitch >= 130:
        print(f"  [VOICE] Pitch: {avg_pitch:.0f}Hz — OK, sem alteracao")
        return ref_path

    print(f"  [VOICE] Voz GRAVE (pitch: {avg_pitch:.0f}Hz) — aplicando pitch shift +1.5 semi...")

    # Pitch shift +1.5 semitones via resampling
    factor = 2 ** (1.5 / 12.0)
    new_len = int(len(audio) / factor)
    indices = np.linspace(0, len(audio) - 1, new_len)
    audio = np.interp(indices, np.arange(len(audio)), audio)

    # Normalizar pico para -3dB
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio * (10 ** (-3.0 / 20.0) / peak)

    # Sobrescreve o arquivo original
    wavfile.write(ref_path, sr, np.clip(audio * 32767, -32768, 32767).astype(np.int16))
    print(f"  [VOICE] Feito! Pitch ~{avg_pitch:.0f}Hz -> ~{avg_pitch * factor:.0f}Hz")
    return ref_path


# ============================================================
# FIM DO PRE-PROCESSAMENTO VOZES GRAVES
# ===========================================================


def to_wav_b64(waveform_float, sr):
    """Salva exatamente no sample rate nativo do OmniVoice."""

    # Unica conversao float -> int16
    waveform_float = np.clip(waveform_float, -1.0, 1.0)
    waveform_int16 = (waveform_float * 32767).astype(np.int16)

    buf = _io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(waveform_int16.tobytes())
    wav_bytes = buf.getvalue()
    dur = len(waveform_int16) / sr
    print(f"  [WAV] {len(wav_bytes)} bytes | {len(waveform_int16)} samples | {sr}Hz | {dur:.1f}s")
    return base64.b64encode(wav_bytes).decode()


def download_ref_audio(url):
    print(f"  [REF] Baixando: {url[:100]}...")
    req = urllib.request.Request(url, headers={
        "User-Agent": "OmniVoice-API/2.0",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    tmp = os.path.join(tempfile.gettempdir(), f"ref_{int(time.time())}.wav")
    with open(tmp, "wb") as f:
        f.write(data)
    print(f"  [REF] Salvo: {tmp} ({len(data)} bytes)")
    return tmp


def save_b64_audio(b64_data):
    if b64_data.startswith("data:"):
        b64_data = b64_data.split(",", 1)[1]
    data = base64.b64decode(b64_data)
    tmp = os.path.join(tempfile.gettempdir(), f"ref_{int(time.time())}.wav")
    with open(tmp, "wb") as f:
        f.write(data)
    return tmp


def generate(text, language, ref_path, instruct, num_step, guidance_scale,
             denoise, speed, duration, mode="clone", ref_text=None):
    if not text or not text.strip():
        return None, "Texto obrigatorio.", 0, 0

    lang_code = None
    if language and language != "Auto":
        lang_code = language.split("(")[-1].rstrip(")").strip() if "(" in language else language

    config = OmniVoiceGenerationConfig(
        num_step=int(num_step or 32),
        guidance_scale=float(guidance_scale) if guidance_scale is not None else 2.0,
        denoise=bool(denoise) if denoise is not None else True,
        preprocess_prompt=True,
        postprocess_output=True,
    )

    kw = dict(text=text.strip(), language=lang_code, generation_config=config)
    if speed is not None and float(speed) != 1.0:
        kw["speed"] = float(speed)
    if duration is not None and float(duration) > 0:
        kw["duration"] = float(duration)

    if mode == "clone":
        if not ref_path:
            return None, "Audio de referencia obrigatorio no modo clone.", 0, 0
        ref_path = _process_deep_voice(ref_path)
        kw["voice_clone_prompt"] = model.create_voice_clone_prompt(
            ref_audio=ref_path, ref_text=ref_text
        )
    elif mode == "design" and instruct and instruct.strip():
        kw["instruct"] = instruct.strip()

    print(f"  [PARAMS] text={text.strip()[:50]}... gs={config.guidance_scale} speed={kw.get('speed', '1.0')}")

    # Cleanup ANTES de gerar
    _pre_generate_cleanup()

    t0 = time.time()
    try:
        audio = model.generate(**kw)
    except Exception as e:
        _post_generate_cleanup()
        return None, f"Erro: {type(e).__name__}: {e}", 0, 0
    gen_time = round(time.time() - t0, 2)

    # Cleanup DEPOIS de gerar
    _post_generate_cleanup()

    # Manter em float! int16 so no to_wav_b64
    # Mover tensor da GPU pra CPU antes de converter
    waveform = audio[0].squeeze()
    if hasattr(waveform, 'cpu'):
        waveform = waveform.cpu()
    if hasattr(waveform, "numpy"):
        waveform = waveform.numpy()
    del audio  # liberar tensor da GPU
    dur = waveform.shape[-1] / sampling_rate
    return waveform, f"{dur:.1f}s gerado em {gen_time}s", gen_time, dur


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.post("/api/gerar")
async def api_gerar(
    text:           str        = Form(...),
    mode:           str        = Form("clone"),
    language:       str        = Form("Auto"),
    ref_text:       str        = Form(""),
    instruct:       str        = Form(""),
    num_step:       int        = Form(32),
    guidance_scale: float      = Form(2.0),
    denoise:        float      = Form(0.8),
    speed:          float      = Form(1.0),
    duration:       float      = Form(0),
    ref_audio:      UploadFile  = File(None),
):
    print(f"\n[/api/gerar] text={text[:50]}... gs={guidance_scale} speed={speed}")
    ref_path = None
    if ref_audio and ref_audio.filename:
        ref_path = os.path.join(tempfile.gettempdir(), f"ref_{int(time.time())}.wav")
        with open(ref_path, "wb") as f:
            f.write(await ref_audio.read())

    result = generate(text, language, ref_path, instruct, num_step, guidance_scale,
                      denoise, speed, duration, mode, ref_text or None)
    if ref_path and os.path.exists(ref_path):
        os.remove(ref_path)

    waveform, msg, gen_time, dur = result if len(result) == 4 else (*result, 0, 0)
    if waveform is None:
        return JSONResponse({"ok": False, "erro": msg}, status_code=400)

    return JSONResponse({
        "ok": True, "status": msg,
        "audio_b64": to_wav_b64(waveform, sampling_rate),
        "sample_rate": sampling_rate,
    })


@app.post("/api/native-generate")
async def api_native(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "JSON invalido"}, status_code=400)

    text = body.get("text", "")
    voice_mode = body.get("voice_mode", "clone")
    ref_url = body.get("ref_audio_url", "")
    ref_b64 = body.get("ref_audio_base64", "")
    language = body.get("language", "Auto")
    instruct = body.get("instruct", "")
    speed = body.get("speed", 1.0)
    num_step = body.get("num_step", 32)
    guidance_scale = body.get("guidance_scale", 2.0)
    ref_text = body.get("ref_text", "")
    denoise = body.get("denoise", True)
    duration = body.get("duration", 0)

    print(f"\n[/api/native-generate] text={text[:50]}... gs={guidance_scale} speed={speed}")

    if not text or not text.strip():
        return JSONResponse({"error": "Texto obrigatorio"}, status_code=400)

    ref_path = None
    try:
        if ref_url:
            ref_path = download_ref_audio(ref_url)
        elif ref_b64:
            ref_path = save_b64_audio(ref_b64)
    except Exception as e:
        return JSONResponse({"error": f"Erro ref audio: {e}"}, status_code=400)

    if voice_mode == "clone" and not ref_path:
        return JSONResponse({"error": "Clone sem audio de referencia"}, status_code=400)

    result = generate(text, language, ref_path, instruct, num_step, guidance_scale,
                      denoise, speed, duration, voice_mode, ref_text or None)
    if ref_path and os.path.exists(ref_path):
        os.remove(ref_path)

    waveform, msg, gen_time, dur = result if len(result) == 4 else (*result, 0, 0)
    if waveform is None:
        print(f"  [FALHA] {msg}")
        return JSONResponse({"error": msg}, status_code=500)

    b64 = to_wav_b64(waveform, sampling_rate)
    print(f"  [OK] {msg}")
    return JSONResponse({
        "status": "ok",
        "audio_base64": b64,
        "duration": dur,
        "generation_time": gen_time,
        "sample_rate": sampling_rate,
    })


@app.post("/api/maint/cleanup")
async def maint_cleanup(request: Request):
    """Forcar deep cleanup de GPU."""
    _deep_cleanup("API")
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "status": "ok",
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_percent": round(pct, 1),
    })


@app.get("/api/maint/status")
async def maint_status():
    """Status da GPU com cleanup leve."""
    _gc.collect()
    torch.cuda.empty_cache()
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "status": "ok",
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A",
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_percent": round(pct, 1),
        "gen_counter": _gen_counter,
    })


@app.post("/api/echo")
async def api_echo(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "JSON invalido"}, status_code=400)
    return JSONResponse({
        "status": "echo",
        "received_keys": list(body.keys()),
        "params": {k: (str(v)[:80] if isinstance(v, str) else v) for k, v in body.items()},
        "server_sr": sampling_rate,
    })


@app.get("/")
async def root():
    return {"status": "online", "modelo": "OmniVoice", "sr": sampling_rate}


if __name__ == "__main__":
    print(f"\nServidor OmniVoice API na porta {PORT}")
    print(f"Saida: {sampling_rate}Hz | Pipeline: float -> clip -> int16")
    print("Endpoints: POST /api/gerar | POST /api/native-generate | POST /api/echo")
    print("Endpoints: POST /api/maint/cleanup | GET /api/maint/status")

    # Cleanup inicial + iniciar monitor de fundo
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        alloc, reserv, pct = _get_vram()
        print(f"[GPU] Inicial: {alloc:.2f}GB alloc / {reserv:.2f}GB reserv ({pct:.0f}%)")
        _monitor_thread = threading.Thread(target=_background_monitor, daemon=True)
        _monitor_thread.start()
        print("[GPU] Monitor de fundo iniciado (verifica a cada 180s)")

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")