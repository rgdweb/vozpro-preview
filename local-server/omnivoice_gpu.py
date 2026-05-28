"""
omnivoice_gpu.py - Servidor NATIVO OmniVoice (sem Gradio)
Tudo em Python: carrega modelo, expoe API REST, gerencia GPU.

Servidor independente — sem dependencia do Gradio para API.
A interface web fica no Vercel, esse arquivo SO gerencia o modelo.

Endpoints:
  GET  /api/maint/status       - VRAM da GPU
  POST /api/maint/cleanup      - forcar limpeza
  POST /api/native-generate    - Geracao 100% nativa (JSON -> OmniVoice -> WAV base64)
  GET  /health                 - Health check

Manutencao automatica:
- Monitor em background: verifica VRAM a cada 3 min, limpa se > 70%
- Pre-geracao: se VRAM > 80%, faz cleanup agressivo antes de gerar
- Pos-geracao: empty_cache + gc.collect
- Deep cleanup: a cada 5 geracoes, faz cleanup triplo com delays

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
"""

import sys
import os
import subprocess

# Auto-instalar dependencias (se ja tiver, ignora silenciosamente)
for _pkg in ["uvicorn", "starlette"]:
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

import torch
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

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
    global _model

    if _model is not None:
        return _model

    from omnivoice import OmniVoice

    print("[OmniVoice] Carregando modelo k2-fsa/OmniVoice na GPU...")
    start = time.time()

    _model = OmniVoice.from_pretrained(
        "k2-fsa/OmniVoice",
        device_map="cuda:0",
        dtype=torch.float16,
        max_memory={0: "10GiB"}
    )

    elapsed = time.time() - start
    print(f"[OmniVoice] Modelo carregado em {elapsed:.1f}s")
    return _model


def _pre_generate_cleanup():
    """Cleanup antes de gerar se VRAM estiver alta."""
    global _gen_counter
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
# ENDPOINTS
# ============================================================

async def index(request):
    """Rota raiz — info basica (compativel com startup scripts e tunnel)."""
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


async def native_generate(request):
    """Endpoint nativo: JSON -> OmniVoice.generate() -> WAV base64.

    Recebe:
    {
        "text": "texto para gerar",
        "voice_mode": "clone" | "design" | "auto",
        "ref_audio_url": "http://... (opcional, para clone)",
        "ref_audio_base64": "base64... (opcional, para clone)",
        "language": "Auto",
        "instruct": "female, low pitch (opcional, para design)",
        "speed": 1.0,
        "num_step": 32,
        "guidance_scale": 2.0
    }

    Retorna:
    {
        "status": "ok",
        "audio_base64": "WAV em base64",
        "audio_size": 123456,
        "duration": 10.5,
        "generation_time": 2.3,
        "rtf": 0.025
    }
    """
    import urllib.request
    import ssl
    import soundfile as _sf

    try:
        body = await request.json()

        text = body.get("text", "")
        if not text or not text.strip():
            return JSONResponse({"status": "error", "error": "Texto obrigatorio"})

        voice_mode = body.get("voice_mode", "clone")
        language = body.get("language", "Auto")
        speed = float(body.get("speed", 1.0))
        num_step = int(body.get("num_step", 32))
        guidance_scale = float(body.get("guidance_scale", 2.0))
        instruct = body.get("instruct", "")
        ref_text = body.get("ref_text", "")
        ref_audio_url = body.get("ref_audio_url", "")
        ref_audio_base64 = body.get("ref_audio_base64", "")

        if _model is None:
            return JSONResponse({"status": "error", "error": "Modelo nao carregado ainda"}, status_code=503)

        # Baixar ou decodificar audio de referencia
        ref_audio_path = ""
        if voice_mode == "clone" and (ref_audio_url or ref_audio_base64):
            try:
                audio_data = None
                if ref_audio_url:
                    req = urllib.request.Request(
                        ref_audio_url,
                        headers={'User-Agent': 'OmniVoice/1.0'}
                    )
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                        audio_data = resp.read()
                    print(f"[Native] Ref audio baixado: {len(audio_data)} bytes de {ref_audio_url[:60]}...")
                elif ref_audio_base64:
                    b64 = ref_audio_base64
                    if ',' in b64 and b64.startswith('data:'):
                        b64 = b64.split(',', 1)[1]
                    audio_data = base64.b64decode(b64)
                    print(f"[Native] Ref audio base64: {len(audio_data)} bytes")

                if audio_data:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        f.write(audio_data)
                        ref_audio_path = f.name
            except Exception as e:
                print(f"[Native] Erro ref audio: {e}")

        # Montar kwargs — EXATAMENTE como OmniVoice funciona no localhost
        kwargs = {
            "text": text.strip(),
            "num_step": num_step,
            "speed": speed,
            "guidance_scale": guidance_scale,
        }

        if ref_audio_path:
            kwargs["ref_audio"] = ref_audio_path

        if instruct and instruct.strip():
            kwargs["instruct"] = instruct.strip()

        if ref_text and ref_text.strip():
            kwargs["ref_text"] = ref_text.strip()

        if language and language.lower() != "auto":
            kwargs["language"] = language

        # Cleanup pre-geracao
        _pre_generate_cleanup()

        # Gerar em thread pool (OmniVoice.generate e sincrono)
        print(f"[Native] Gerando: mode={voice_mode} speed={speed} cfg={guidance_scale} steps={num_step} text=\"{text[:60]}...\"")
        start = time.time()

        loop = asyncio.get_event_loop()
        audio_list = await loop.run_in_executor(
            None, lambda: _model.generate(**kwargs)
        )
        audio_array = audio_list[0]

        elapsed = time.time() - start
        duration = len(audio_array) / SAMPLE_RATE
        rtf = elapsed / duration if duration > 0 else 0
        print(f"[Native] OK: {elapsed:.2f}s (duracao={duration:.1f}s, RTF={rtf:.3f})")

        # Cleanup pos-geracao
        _post_generate_cleanup()

        # Converter para WAV
        buf = io.BytesIO()
        _sf.write(buf, audio_array, SAMPLE_RATE, format='WAV')
        wav_bytes = buf.getvalue()

        # Cleanup temp file
        if ref_audio_path and os.path.exists(ref_audio_path):
            os.unlink(ref_audio_path)

        return JSONResponse({
            "status": "ok",
            "audio_base64": base64.b64encode(wav_bytes).decode('ascii'),
            "audio_size": len(wav_bytes),
            "duration": round(duration, 2),
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

        # Monitor automatico em background
        _monitor_thread = threading.Thread(target=_background_monitor, daemon=True)
        _monitor_thread.start()
        print(f"  [OK] Monitor automatico ativo (verifica a cada 3 min)")
    else:
        print("[AVISO] CUDA nao disponivel, rodando sem GPU")

    # Carregar modelo antes de subir o servidor
    load_model()

    print("=" * 55)
    print(f"  [OK] Endpoints ativos (servidor puro, SEM Gradio):")
    print(f"       GET  /health                (health check)")
    print(f"       GET  /api/maint/status       (VRAM + info)")
    print(f"       POST /api/maint/cleanup      (forcar deep cleanup)")
    print(f"       POST /api/native-generate    (geracao 100% nativa)")
    print("=" * 55)

    # Subir servidor com uvicorn
    uvicorn.run(app, host=args.ip, port=args.port, log_level="warning")
