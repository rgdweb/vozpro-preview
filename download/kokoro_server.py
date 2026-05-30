"""
kokoro_server.py - Servidor Kokoro-82M standalone com API compatível com OmniVoice.
Usado como motor secundário (fallback) para gerações que não precisam de clonagem de voz.

Kokoro-82M é extremamente leve (~1GB VRAM) e gera em ~200ms.
Ideal para descarregar gerações simples da fila OmniVoice.

Endpoints:
  GET  /health                     - Health check
  POST /api/kokoro-generate        - Geração TTS (formato compatível com native-generate)
  GET  /api/kokoro/status          - Status do servidor Kokoro

USO: python kokoro_server.py --ip 0.0.0.0 --port 7861
"""

import sys
import os

import gc as _gc
import time
import json
import io
import base64
import argparse
import threading
from typing import Optional

import torch
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

# ============================================================
# KOKORO MODEL
# ============================================================

_kokoro_pipeline = None
KOKORO_SAMPLE_RATE = 24000
_kokoro_loading = False
_kokoro_ready = False


def load_kokoro():
    """Carrega o modelo Kokoro-82M."""
    global _kokoro_pipeline, _kokoro_loading, _kokoro_ready

    if _kokoro_pipeline is not None:
        return _kokoro_pipeline

    if _kokoro_loading:
        # Esperar outra thread carregar
        while _kokoro_loading:
            time.sleep(0.5)
        return _kokoro_pipeline

    _kokoro_loading = True
    try:
        from kokoro import KPipeline

        print("[Kokoro] Carregando modelo Kokoro-82M...")
        start = time.time()

        _kokoro_pipeline = KPipeline(lang_code="b")  # 'b' = bilingual (EN + PT)

        elapsed = time.time() - start
        print(f"[Kokoro] Modelo carregado em {elapsed:.1f}s")
        _kokoro_ready = True
    except Exception as e:
        print(f"[Kokoro] ERRO ao carregar: {e}")
    finally:
        _kokoro_loading = False

    return _kokoro_pipeline


def _cleanup():
    """Cleanup de GPU."""
    if torch.cuda.is_available():
        _gc.collect()
        torch.cuda.empty_cache()


# ============================================================
# ENDPOINTS
# ============================================================

async def health(request):
    """Health check."""
    return JSONResponse({
        "status": "ok",
        "engine": "kokoro-82m",
        "model_loaded": _kokoro_ready,
        "kokoro_pipeline": _kokoro_pipeline is not None,
    })


async def kokoro_status(request):
    """Status detalhado do Kokoro."""
    _cleanup()
    info = {
        "engine": "kokoro-82m",
        "ready": _kokoro_ready,
        "loading": _kokoro_loading,
    }
    if torch.cuda.is_available():
        alloc = torch.cuda.memory_allocated(0) / (1024**3)
        reserv = torch.cuda.memory_reserved(0) / (1024**3)
        total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        info.update({
            "cuda": True,
            "gpu": torch.cuda.get_device_name(0),
            "vram_alloc_gb": round(alloc, 2),
            "vram_reserved_gb": round(reserv, 2),
            "vram_total_gb": round(total, 1),
        })
    else:
        info["cuda"] = False
    return JSONResponse(info)


async def kokoro_generate(request):
    """Endpoint de geracao Kokoro-82M (formato compatível com native-generate).

    Recebe o mesmo JSON do native-generate:
    {
        "text": "texto para gerar",
        "speed": 1.0,
        "voice": "zf_xiaobei"  (opcional, voz Kokoro)
    }

    Retorna o mesmo formato:
    {
        "status": "ok",
        "audio_base64": "WAV em base64",
        "audio_size": 123456,
        "duration": 10.5,
        "generation_time": 0.2,
        "rtf": 0.05,
        "engine": "kokoro-82m"
    }

    NOTA: Kokoro NÃO suporta clonagem de voz.
    Para clonagem, use /api/native-generate (OmniVoice).
    """
    import soundfile as sf

    try:
        body = await request.json()

        text = body.get("text", "")
        if not text or not text.strip():
            return JSONResponse({"status": "error", "error": "Texto obrigatorio"})

        speed = float(body.get("speed", 1.0))
        voice = body.get("voice", "zf_xiaobei")  # Voz padrão Kokoro

        if _kokoro_pipeline is None:
            # Tentar carregar
            load_kokoro()
            if _kokoro_pipeline is None:
                return JSONResponse(
                    {"status": "error", "error": "Kokoro nao disponivel. OmniVoice sera usado."},
                    status_code=503
                )

        _cleanup()

        # Gerar com Kokoro
        print(f"[Kokoro] Gerando: speed={speed} voice={voice} text=\"{text[:80]}...\"")
        start = time.time()

        # Kokoro usa generator pattern
        import numpy as np
        audio_chunks = []
        sr = KOKORO_SAMPLE_RATE

        for i, (gs, _ps, audio) in enumerate(_kokoro_pipeline(text, voice=voice, speed=speed)):
            audio_chunks.append(audio)

        if not audio_chunks:
            return JSONResponse({"status": "error", "error": "Kokoro nao gerou audio"})

        # Concatenar chunks
        audio_array = np.concatenate(audio_chunks) if len(audio_chunks) > 1 else audio_chunks[0]

        elapsed = time.time() - start
        duration = len(audio_array) / sr
        rtf = elapsed / duration if duration > 0 else 0
        print(f"[Kokoro] OK: {elapsed:.2f}s (duracao={duration:.1f}s, RTF={rtf:.3f})")

        _cleanup()

        # Converter para WAV
        buf = io.BytesIO()
        sf.write(buf, audio_array, sr, format='WAV')
        wav_bytes = buf.getvalue()

        return JSONResponse({
            "status": "ok",
            "audio_base64": base64.b64encode(wav_bytes).decode('ascii'),
            "audio_size": len(wav_bytes),
            "duration": round(duration, 2),
            "generation_time": round(elapsed, 2),
            "rtf": round(rtf, 4),
            "engine": "kokoro-82m",
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


# ============================================================
# APP
# ============================================================

app = Starlette(
    routes=[
        Route("/", lambda r: JSONResponse({
            "service": "Kokoro-82M TTS Server",
            "engine": "kokoro-82m",
            "model_loaded": _kokoro_ready,
            "endpoints": {
                "health": "GET /health",
                "status": "GET /api/kokoro/status",
                "generate": "POST /api/kokoro-generate",
            },
        })),
        Route("/health", health, methods=["GET"]),
        Route("/api/kokoro/status", kokoro_status, methods=["GET"]),
        Route("/api/kokoro-generate", kokoro_generate, methods=["POST"]),
    ],
    middleware=[
        Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
    ],
)


if __name__ == '__main__':
    import uvicorn

    parser = argparse.ArgumentParser(description="Kokoro-82M TTS Server")
    parser.add_argument("--ip", default="0.0.0.0", help="IP para bindar")
    parser.add_argument("--port", type=int, default=7861, help="Porta do servidor")
    args = parser.parse_args()

    print("=" * 55)
    print("  Kokoro-82M TTS Server (motor secundario VozPro)")
    print(f"  Porta: {args.port}")
    print("=" * 55)

    # Carregar modelo ao iniciar
    load_kokoro()

    print("=" * 55)
    print(f"  [OK] Endpoints:")
    print(f"       GET  /health                 (health check)")
    print(f"       GET  /api/kokoro/status      (status detalhado)")
    print(f"       POST /api/kokoro-generate    (geracao TTS)")
    print("=" * 55)

    uvicorn.run(app, host=args.ip, port=args.port, log_level="warning")
