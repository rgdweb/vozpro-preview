"""
omnivoice_gpu.py - Servidor NATIVO OmniVoice (sem Gradio)
Tudo em Python: carrega modelo, expoe API REST, gerencia GPU.

Servidor independente — sem dependencia do Gradio para API.
A interface web fica no Vercel, esse arquivo SO gerencia o modelo.

Padrao 100% alinhado ao HF Space: https://huggingface.co/spaces/k2-fsa/OmniVoice
- Usa OmniVoiceGenerationConfig
- Usa model.create_voice_clone_prompt()
- language "Auto" -> None
- Audio: (audio[0] * 32767).astype(np.int16)

Sistema de Raio: Cache de locutores oficiais em embeddings/ para latencia zero.

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
"""

import sys
import os
import subprocess

# Auto-instalar dependencias (se ja tiver, ignora silenciosamente)
for _pkg in ["uvicorn", "starlette", "soundfile", "numpy"]:
    try:
        __import__(_pkg)
    except ImportError:
        print(f"[Setup] Instalando {_pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", _pkg, "-q"])

import gc as _gc
import threading
import time
import json
import tempfile
import base64
import io
import asyncio
import argparse
from typing import Optional

import numpy as np
import torch
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

# ============================================================
# KOKORO FALLBACK CONFIG
# ============================================================
KOKORO_URL = os.environ.get("KOKORO_URL", "")
KOKORO_VRAM_THRESHOLD = 60
_queue_depth = 0
_queue_lock = threading.Lock()

# ============================================================
# MANUTENCAO AUTOMATICA INTELIGENTE
# ============================================================

_gen_counter = 0
_gen_counter_lock = threading.Lock()

_gpu_name = ""
_gpu_total = 0.0


def _get_vram():
    """Retorna (allocated_gb, reserved_gb, usage_percent)."""
    if not torch.cuda.is_available():
        return 0, 0, 0
    alloc = torch.cuda.memory_allocated(0) / (1024**3)
    reserv = torch.cuda.memory_reserved(0) / (1024**3)
    pct = (reserv / _gpu_total) * 100 if _gpu_total > 0 else 0
    return alloc, reserv, pct


def _smart_cleanup(label=""):
    """Cleanup inteligente: gc.collect + empty_cache com delay para o driver liberar."""
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
    """Deep cleanup: 3 passes com delays para liberar VRAM fragmentada."""
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


# ============================================================
# MODELO OMNIVOICE (carregado uma vez)
# ============================================================

_model = None
SAMPLE_RATE = 24000


def load_model():
    """Carrega o modelo OmniVoice na GPU."""
    global _model, SAMPLE_RATE

    if _model is not None:
        return _model

    from omnivoice import OmniVoice

    print("[OmniVoice] Carregando modelo k2-fsa/OmniVoice na GPU...")
    start = time.time()

    _model = OmniVoice.from_pretrained(
        "k2-fsa/OmniVoice",
        device_map="cuda",
        dtype=torch.float16,
        load_asr=True,
    )

    SAMPLE_RATE = _model.sampling_rate
    elapsed = time.time() - start
    print(f"[OmniVoice] Modelo carregado em {elapsed:.1f}s (sample_rate={SAMPLE_RATE})")
    return _model


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
# ENDPOINTS BASICOS
# ============================================================

async def index(request):
    """Rota raiz — info basica."""
    return JSONResponse({
        "service": "OmniVoice Native Server",
        "model_loaded": _model is not None,
        "gpu": _gpu_name if torch.cuda.is_available() else None,
        "endpoints": {
            "health": "GET /health",
            "status": "GET /api/maint/status",
            "cleanup": "POST /api/maint/cleanup",
            "generate": "POST /api/native-generate",
        },
    })


async def health(request):
    """Health check simples."""
    return JSONResponse({"status": "ok", "model_loaded": _model is not None})


async def maint_status(request):
    """VRAM da GPU e info."""
    _gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "cuda": torch.cuda.is_available(),
        "gpu": _gpu_name if torch.cuda.is_available() else None,
        "vram_total_gb": round(_gpu_total, 1) if torch.cuda.is_available() else 0,
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_free_gb": round((_gpu_total - reserv), 2) if torch.cuda.is_available() else 0,
        "vram_percent": round(pct, 1),
        "gen_counter": _gen_counter,
        "auto_cleanup": "active",
    })


async def maint_cleanup(request):
    """Forcar deep cleanup de GPU."""
    _deep_cleanup("API")
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "status": "ok",
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_percent": round(pct, 1),
    })


# ============================================================
# ROUTER: Decide OmniVoice vs Kokoro baseado na carga
# ============================================================

def _should_use_kokoro(voice_mode, has_ref_audio):
    """Decide se deve rotear para Kokoro em vez de OmniVoice."""
    if not KOKORO_URL:
        return False

    if voice_mode in ("clone", "clone_fast", "design") or has_ref_audio:
        return False

    if torch.cuda.is_available():
        _, reserv, pct = _get_vram()
        if pct > KOKORO_VRAM_THRESHOLD:
            print(f"[Router] VRAM em {pct:.0f}% > threshold {KOKORO_VRAM_THRESHOLD}% — roteando para Kokoro")
            return True

    with _queue_lock:
        if _queue_depth > 1:
            print(f"[Router] Fila com {_queue_depth} requisicoes — roteando para Kokoro")
            return True

    return False


async def _forward_to_kokoro(body):
    """Encaminha a requisicao para o servidor Kokoro-82M."""
    import urllib.request

    kokoro_body = {
        "text": body.get("text", ""),
        "speed": body.get("speed", 1.0),
    }

    data = json.dumps(kokoro_body).encode('utf-8')
    req = urllib.request.Request(
        f"{KOKORO_URL}/api/kokoro-generate",
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            result["via_router"] = True
            return result
    except Exception as e:
        print(f"[Router] Kokoro falhou ({e}), caindo de volta para OmniVoice")
        return None


async def smart_generate(request):
    """Endpoint inteligente: roteia automaticamente entre OmniVoice e Kokoro-82M."""
    try:
        body = await request.json()

        voice_mode = body.get("voice_mode", "auto")
        has_ref_audio = bool(body.get("ref_audio_url") or body.get("ref_audio_base64") or body.get("speaker_id"))

        use_kokoro = _should_use_kokoro(voice_mode, has_ref_audio)

        if use_kokoro:
            with _queue_lock:
                global _queue_depth
                _queue_depth += 1
            try:
                result = await _forward_to_kokoro(body)
                if result and result.get("status") == "ok":
                    return JSONResponse(result)
            finally:
                with _queue_lock:
                    _queue_depth = max(0, _queue_depth - 1)

        with _queue_lock:
            _queue_depth += 1
        try:
            return await native_generate(request)
        finally:
            with _queue_lock:
                _queue_depth = max(0, _queue_depth - 1)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


async def router_status(request):
    """Status do sistema de roteamento."""
    _, reserv, pct = _get_vram()
    return JSONResponse({
        "engine_primary": "omnivoice",
        "engine_fallback": "kokoro-82m",
        "kokoro_url": KOKORO_URL or "not configured",
        "kokoro_enabled": bool(KOKORO_URL),
        "vram_threshold": KOKORO_VRAM_THRESHOLD,
        "vram_current_percent": round(pct, 1),
        "vram_reserved_gb": round(reserv, 2),
        "current_queue_depth": _queue_depth,
        "routing_logic": "auto -> kokoro when VRAM > threshold OR queue > 1; clone/design -> omnivoice always",
    })


# ============================================================
# ENDPOINT PRINCIPAL: native_generate (PADRAO HF SPACE + SISTEMA RAIO)
# ============================================================

async def native_generate(request):
    """Endpoint nativo: JSON -> OmniVoice.generate() -> WAV base64.

    Fluxo:
    1. Smart-Format: reformatar ritmo do texto com pausas ocultas
    2. Cache PRIORITARIO: checa SSD antes de qualquer download/decode
    3. Contingencia: decodifica base64 do payload PHP ou baixa URL
    4. Carrega WAV em numpy array
    5. create_voice_clone_prompt() (padrao HF Space)
    6. model.generate() -> WAV base64
    """
    import urllib.request
    import ssl
    import re
    import soundfile as _sf

    try:
        body = await request.json()

        # --- Captura de parametros ---
        text_raw = body.get("text", "")
        if not text_raw or not text_raw.strip():
            return JSONResponse({"status": "error", "error": "Texto obrigatorio"})

        voice_mode = body.get("voice_mode", "clone")
        language = body.get("language", "Auto")

        # Garante fallbacks numericos seguros
        speed = body.get("speed", None)
        speed = 1.0 if speed is None else float(speed)

        num_step = body.get("num_step", None)
        num_step = 32 if num_step is None else int(num_step)

        guidance_scale = body.get("guidance_scale", None)
        guidance_scale = 2.0 if guidance_scale is None else float(guidance_scale)

        denoise = body.get("denoise", None)
        denoise = True if denoise is None else (denoise == True)

        postprocess_output = body.get("postprocess_output", None)
        postprocess_output = True if postprocess_output is None else (postprocess_output == True)

        preprocess_prompt = body.get("preprocess_prompt", True) == True
        duration = body.get("duration", None)
        instruct = body.get("instruct", "")
        ref_text = body.get("ref_text", "")
        ref_audio_url = body.get("ref_audio_url", "")
        ref_audio_base64 = body.get("ref_audio_base64", "")
        speaker_id = body.get("speaker_id", "")

        # --- Smart-Format: ritmo com pausas ocultas ---
        texto_limpo = text_raw.strip()
        texto_com_pausas = re.sub(r'([.!?])\s*', r'\1\n\n', texto_limpo)
        texto_com_pausas = texto_com_pausas.strip()
        text = texto_com_pausas + ". "
        print(f"[Smart-Format] Texto original reformatado com pausas ocultas com sucesso!")

        if _model is None:
            return JSONResponse({"status": "error", "error": "Modelo nao carregado ainda"}, status_code=503)

        # ================================================================
        # SISTEMA DE CACHE PRIORITARIO (SSD PRIMEIRO, DEPOIS DECODE)
        # ================================================================
        os.makedirs("embeddings", exist_ok=True)
        ref_audio_path = ""
        is_clone_fast = voice_mode in ("clone_fast", "clone_fast ")

        # PASSO 1: CHECAGEM DO CACHE NO SSD (LOCUTORES OFICIAIS)
        if is_clone_fast and speaker_id and str(speaker_id).strip():
            nome_arquivo_locutor = str(speaker_id).strip()
            if not nome_arquivo_locutor.endswith(".wav"):
                nome_arquivo_locutor += ".wav"
            caminho_cache = os.path.join("embeddings", nome_arquivo_locutor)

            # Se o arquivo ja existe localmente, ATIVA O MODO RAIO
            if os.path.exists(caminho_cache):
                print(f"[SISTEMA RAIO] Locutor '{nome_arquivo_locutor}' lido do SSD! Latencia zero.")
                ref_audio_path = caminho_cache

        # PASSO 2: CONTINGENCIA — DECODIFICAÇÃO DO PAYLOAD SE NÃO ESTIVER NO CACHE
        if not ref_audio_path:
            try:
                audio_data = None

                # Prioridade Maxima: Base64 puro enviado pelo PHP da Oracle Cloud
                if ref_audio_base64 and str(ref_audio_base64).strip():
                    b64 = str(ref_audio_base64).strip()
                    if ',' in b64 and b64.startswith('data:'):
                        b64 = b64.split(',', 1)[1]
                    audio_data = base64.b64decode(b64)
                    print(f"[Native] Decodificando payload Base64: {len(audio_data)} bytes prontos.")

                # Fallback secundario: baixa da URL caso Base64 venha em branco
                elif ref_audio_url and str(ref_audio_url).strip():
                    req = urllib.request.Request(ref_audio_url, headers={'User-Agent': 'OmniVoice/1.0'})
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                        audio_data = resp.read()
                    print(f"[Native] Fallback: Baixando ref_audio_url da internet...")

                if audio_data:
                    # Se for locutor oficial (clone_fast), salva permanentemente no SSD
                    if is_clone_fast and speaker_id and str(speaker_id).strip():
                        nome_arquivo_locutor = str(speaker_id).strip()
                        if not nome_arquivo_locutor.endswith(".wav"):
                            nome_arquivo_locutor += ".wav"
                        ref_audio_path = os.path.join("embeddings", nome_arquivo_locutor)
                        with open(ref_audio_path, "wb") as f:
                            f.write(audio_data)
                        print(f"[Cache-Salvo] Locutor '{nome_arquivo_locutor}' armazenado no SSD.")
                    else:
                        # Upload temporario de cliente — joga no temp do Windows
                        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                            f.write(audio_data)
                            ref_audio_path = f.name
            except Exception as e:
                print(f"[Erro Audio] Falha ao processar referencia: {e}")

        # ================================================================
        # CARREGAR WAV EM NUMPY ARRAY (para create_voice_clone_prompt)
        # ================================================================
        if not ref_audio_path or not os.path.exists(ref_audio_path):
            return JSONResponse({"status": "error", "error": "Audio de referencia nao encontrado"}, status_code=400)

        try:
            info = _sf.info(ref_audio_path)
            ref_audio_array, ref_sr = _sf.read(ref_audio_path)
            print(f"[Native] Ref audio carregado: {info.duration:.1f}s {ref_sr}Hz {_sf.info(ref_audio_path).channels}ch")

            # Se stereo, pegar primeiro canal
            if len(ref_audio_array.shape) > 1:
                ref_audio_array = ref_audio_array[:, 0]

            # Resampling se necessario (converte para float32 para resampling seguro)
            if ref_sr != SAMPLE_RATE:
                import torchaudio
                tensor_audio = torch.from_numpy(ref_audio_array.astype(np.float32)).unsqueeze(0)
                if ref_sr != SAMPLE_RATE:
                    resampler = torchaudio.transforms.Resample(orig_freq=ref_sr, new_freq=SAMPLE_RATE)
                    tensor_audio = resampler(tensor_audio)
                ref_audio_array = tensor_audio.squeeze(0).numpy()
                print(f"[Native] Resampling: {ref_sr} -> {SAMPLE_RATE}")
        except Exception as e:
            print(f"[Native] Erro ao carregar audio de referencia: {e}")
            return JSONResponse({"status": "error", "error": f"Falha ao carregar audio: {e}"}, status_code=500)

        # ================================================================
        # MONTAR KWARGS — PADRAO HF SPACE
        # ================================================================

        # 1) OmniVoiceGenerationConfig (com fallback se nao existir)
        try:
            from omnivoice import OmniVoiceGenerationConfig

            gen_config = OmniVoiceGenerationConfig(
                num_step=int(num_step or 32),
                guidance_scale=float(guidance_scale) if guidance_scale is not None else 2.0,
                denoise=bool(denoise) if denoise is not None else True,
                preprocess_prompt=bool(preprocess_prompt),
                postprocess_output=bool(postprocess_output) if postprocess_output is not None else True,
            )
        except ImportError:
            gen_config = None

        # 2) Language: "Auto" -> None (PADRAO HF Space)
        lang = language if (language and language != "Auto") else None

        # 3) Montar kw dict
        if gen_config is not None:
            kw = dict(
                text=text.strip(),
                language=lang,
                generation_config=gen_config,
            )
        else:
            # Fallback sem OmniVoiceGenerationConfig
            kw = dict(
                text=text.strip(),
                num_step=int(num_step or 32),
                guidance_scale=float(guidance_scale) if guidance_scale is not None else 2.0,
            )
            if lang is not None:
                kw["language"] = lang

        # Speed: so passa se diferente de 1.0
        if speed is not None and float(speed) != 1.0:
            kw["speed"] = float(speed)

        # Duration: so passa se > 0
        if duration is not None:
            try:
                d = float(duration)
                if d > 0:
                    kw["duration"] = d
            except (ValueError, TypeError):
                pass

        # Instruct
        if instruct and instruct.strip():
            kw["instruct"] = instruct.strip()

        # 4) Voice clone prompt — PADRAO HF SPACE: create_voice_clone_prompt()
        try:
            # ref_text vazio -> None (modelo faz ASR automatico com load_asr=True)
            _ref_text = ref_text.strip() if ref_text and ref_text.strip() else None

            voice_clone_prompt = _model.create_voice_clone_prompt(
                ref_audio=ref_audio_array,
                ref_text=_ref_text,
            )
            kw["voice_clone_prompt"] = voice_clone_prompt
            print(f"[Native] voice_clone_prompt criado (padrao HF Space) ref_text={'sim' if _ref_text else 'ASR-auto'}")
        except AttributeError:
            print(f"[Native] create_voice_clone_prompt nao disponivel, usando ref_audio/ref_text direto")
            kw["ref_audio"] = ref_audio_path
            if ref_text and ref_text.strip():
                kw["ref_text"] = ref_text.strip()
        except Exception as e:
            print(f"[Native] Erro create_voice_clone_prompt ({e}), usando ref_audio/ref_text direto")
            kw["ref_audio"] = ref_audio_path
            if ref_text and ref_text.strip():
                kw["ref_text"] = ref_text.strip()

        # ================================================================
        # GERAR AUDIO
        # ================================================================
        _pre_generate_cleanup()

        print(f"[Native] Gerando: mode={voice_mode} lang={lang or 'Auto'} cfg={guidance_scale} steps={num_step} text=\"{text[:60]}...\"")
        start = time.time()

        loop = asyncio.get_event_loop()
        audio_list = await loop.run_in_executor(
            None, lambda: _model.generate(**kw)
        )

        elapsed = time.time() - start

        # ================================================================
        # CONVERTER AUDIO — PADRAO HF SPACE: (audio[0] * 32767).astype(np.int16)
        # ================================================================
        raw_audio = audio_list[0]
        if hasattr(raw_audio, "cpu"):
            raw_audio = raw_audio.cpu().numpy()

        waveform_int16 = (raw_audio * 32767).astype(np.int16)

        audio_duration = len(waveform_int16) / SAMPLE_RATE
        rtf = elapsed / audio_duration if audio_duration > 0 else 0
        print(f"[Native] OK: {elapsed:.2f}s (duracao={audio_duration:.1f}s, RTF={rtf:.3f})")

        _post_generate_cleanup()

        # Converter int16 array para WAV bytes
        buf = io.BytesIO()
        _sf.write(buf, waveform_int16, SAMPLE_RATE, format='WAV', subtype='PCM_16')
        wav_bytes = buf.getvalue()

        # Limpeza: so deleta se NAO estiver na pasta embeddings/
        if ref_audio_path and "embeddings" not in ref_audio_path and os.path.exists(ref_audio_path):
            try:
                os.unlink(ref_audio_path)
                print("[Native] Arquivo temporario comum limpo com sucesso.")
            except Exception as clean_err:
                print(f"[Native] Aviso na limpeza temporaria: {clean_err}")

        return JSONResponse({
            "status": "ok",
            "audio_base64": base64.b64encode(wav_bytes).decode('ascii'),
            "audio_size": len(wav_bytes),
            "duration": round(audio_duration, 2),
            "generation_time": round(elapsed, 2),
            "rtf": round(rtf, 4),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


# ============================================================
# APP STARLETTE (servidor puro, sem Gradio)
# ============================================================

app = Starlette(
    routes=[
        Route("/", index, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route("/api/maint/status", maint_status, methods=["GET"]),
        Route("/api/maint/cleanup", maint_cleanup, methods=["POST"]),
        Route("/api/native-generate", native_generate, methods=["POST"]),
        Route("/api/smart-generate", smart_generate, methods=["POST"]),
        Route("/api/router/status", router_status, methods=["GET"]),
    ],
    middleware=[
        Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
    ],
)


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    import uvicorn

    parser = argparse.ArgumentParser(description="OmniVoice Native Server (sem Gradio)")
    parser.add_argument("--ip", default="0.0.0.0", help="IP para bindar")
    parser.add_argument("--port", type=int, default=7860, help="Porta do servidor")
    args = parser.parse_args()

    # GPU info
    if torch.cuda.is_available():
        _gpu_name = torch.cuda.get_device_name(0)
        _gpu_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print("=" * 55)
        print(f"  OmniVoice Native Server - {_gpu_name}")
        print(f"  VRAM: {_gpu_total:.1f} GB")
        print("=" * 55)
        print(f"  [OK] Cache limpo")
        torch.cuda.empty_cache()

        _monitor_thread = threading.Thread(target=_background_monitor, daemon=True)
        _monitor_thread.start()
        print(f"  [OK] Monitor automatico ativo (verifica a cada 3 min)")
    else:
        print("[AVISO] CUDA nao disponivel, rodando sem GPU")

    load_model()

    print("=" * 55)
    print(f"  [OK] Endpoints ativos (servidor puro, SEM Gradio):")
    print(f"       GET  /health                 (health check)")
    print(f"       GET  /api/maint/status       (VRAM + info)")
    print(f"       POST /api/maint/cleanup      (forcar deep cleanup)")
    print(f"       POST /api/native-generate    (geracao 100% nativa)")
    print(f"       POST /api/smart-generate     (ROTEADOR: OmniVoice/Kokoro)")
    print(f"       GET  /api/router/status       (status do roteador)")
    if KOKORO_URL:
        print(f"  [OK] Kokoro fallback: {KOKORO_URL}")
    else:
        print(f"  [--] Kokoro fallback: nao configurado (set KOKORO_URL=http://localhost:7861)")
    print("=" * 55)

    uvicorn.run(app, host=args.ip, port=args.port, log_level="warning")
