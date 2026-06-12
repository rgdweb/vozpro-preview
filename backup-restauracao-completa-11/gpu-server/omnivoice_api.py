"""
OmniVoice GPU Server
====================
Endpoints:
  POST /api/gerar           - FormData (gerador.html)
  POST /api/native-generate - JSON (VozPro via tunnel)
  POST /api/echo            - Diagnostico
  GET  /                    - Status

Pipeline: modelo gera float -> resample float -> clip -> int16 (uma unica conversao)
"""

import os, sys, time, io as _io, wave, base64, tempfile, json, urllib.request
import numpy as np
import torch
import torchaudio
from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

PORT = 8000
OUTPUT_SR = 44100

print("Carregando OmniVoice na GPU...")
from omnivoice import OmniVoice, OmniVoiceGenerationConfig

model = OmniVoice.from_pretrained(
    "k2-fsa/OmniVoice",
    device_map="cuda", dtype=torch.float16,
    load_asr=True, token=False,
)
sampling_rate = model.sampling_rate
print(f"Modelo carregado! SR={sampling_rate}Hz, GPU={torch.cuda.get_device_name(0)}")


def to_wav_b64(waveform_float, sr):
    """Recebe float array, resample se necessario, converte pra WAV base64."""
    if sr != OUTPUT_SR:
        wav_tensor = torch.from_numpy(waveform_float.astype(np.float32)).unsqueeze(0)
        resampled = torchaudio.functional.resample(wav_tensor, sr, OUTPUT_SR)
        waveform_float = resampled.squeeze(0).numpy()
        sr = OUTPUT_SR
        print(f"  [RESAMPLE] {sampling_rate}Hz -> {OUTPUT_SR}Hz")

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
        kw["voice_clone_prompt"] = model.create_voice_clone_prompt(
            ref_audio=ref_path, ref_text=ref_text
        )
    elif mode == "design" and instruct and instruct.strip():
        kw["instruct"] = instruct.strip()

    print(f"  [PARAMS] text={text.strip()[:50]}... gs={config.guidance_scale} speed={kw.get('speed', '1.0')}")

    t0 = time.time()
    try:
        audio = model.generate(**kw)
    except Exception as e:
        return None, f"Erro: {type(e).__name__}: {e}", 0, 0
    gen_time = round(time.time() - t0, 2)

    # Manter em float! int16 so no to_wav_b64
    waveform = audio[0].squeeze()
    if hasattr(waveform, "numpy"):
        waveform = waveform.numpy()
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
        "sample_rate": OUTPUT_SR,
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
        "sample_rate": OUTPUT_SR,
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
    print(f"Saida: {OUTPUT_SR}Hz | Pipeline: float -> resample -> clip -> int16")
    print("Endpoints: POST /api/gerar | POST /api/native-generate | POST /api/echo")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")