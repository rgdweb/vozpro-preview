"""
omnivoice_gpu.py - Servidor NATIVO OmniVoice (sem Gradio)
Tudo em Python: carrega modelo, expoe API REST, gerencia GPU.

Servidor independente — sem dependencia do Gradio para API.
A interface web fica na VPS Oracle, esse arquivo SO gerencia o modelo.

Endpoints:
  GET  /api/maint/status       - VRAM da GPU
  POST /api/maint/cleanup      - forcar limpeza
  POST /api/native-generate    - Geracao 100% nativa (JSON -> OmniVoice -> WAV base64)
  POST /api/smart-generate     - Roteador OmniVoice/Kokoro (inteligente)
  GET  /api/router/status      - Status do roteador
  GET  /health                 - Health check

Crossfade automatico:
- Textos > 180 chars sao divididos em frases por pontuacao
- Cada frase gerada separadamente (preprocess_prompt=False)
- Concatenadas com crossfade de 60ms para eliminar cortes
- Fallback automatico para geracao normal se falhar

Kokoro-82M Fallback:
- Quando VRAM > 60% ou fila > 1 requisicao, roteia para Kokoro
- Clone e design SEMPRE vao para OmniVoice
- Fallback automatico: se Kokoro falhar, volta para OmniVoice

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
# KOKORO FALLBACK CONFIG
# ============================================================
KOKORO_URL = os.environ.get("KOKORO_URL", "")  # Ex: http://localhost:7861
KOKORO_ENABLED = False  # Sera ativado automaticamente se KOKORO_URL estiver configurada
KOKORO_VRAM_THRESHOLD = 60  # % de VRAM acima do qual ativa Kokoro como fallback

# ============================================================
# FILA DE REQUISICOES
# ============================================================
_queue_depth = 0  # Contador de requisicoes simultaneas (simples)
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
# CROSSFADE POR FRASES (elimina cortes em textos longos)
# ============================================================

import re as _re
import numpy as _np

CROSSFADE_ENABLED = True
CROSSFADE_MS = 60          # ms de overlap entre frases
CROSSFADE_MIN_LEN = 180    # min chars pra ativar crossfade


def _split_sentences(text):
    """Divide texto em frases respeitando pontuacao natural."""
    # Dividir por: ponto final, ponto e virgula, dois pontos, exclamacao, interrogacao
    # Mas NAO dividir por virgula (muito curto)
    parts = _re.split(r'(?<=[.!?:])\s+', text.strip())

    # Se alguma parte ficou muito grande (>300 chars), tentar subdividir por virgula
    final = []
    for p in parts:
        p = p.strip()
        if len(p) > 300:
            # Subdividir por virgulas, mantendo a virgula
            sub_parts = _re.split(r'(?<=,)\s+', p)
            final.extend([s.strip() for s in sub_parts if s.strip()])
        else:
            final.append(p)

    return [p for p in final if len(p) > 3]


def _crossfade_audio(audio_chunks):
    """Concatena chunks de audio com crossfade suave entre eles."""
    if not audio_chunks:
        return _np.array([])
    if len(audio_chunks) == 1:
        return audio_chunks[0]

    fade_samples = int((CROSSFADE_MS / 1000.0) * SAMPLE_RATE)
    result = audio_chunks[0].copy()

    for i in range(1, len(audio_chunks)):
        chunk = audio_chunks[i]
        if len(chunk) == 0:
            continue

        # Fade out do final do resultado anterior
        if len(result) > fade_samples:
            fade_out_end = len(result)
            fade_out_start = fade_out_end - fade_samples
            result[fade_out_start:fade_out_end] *= _np.linspace(1.0, 0.0, fade_samples)

        # Fade in do inicio do chunk atual
        if len(chunk) > fade_samples:
            chunk[:fade_samples] *= _np.linspace(0.0, 1.0, fade_samples)

        # Sobrepor: somar os overlaps
        if len(result) > fade_samples and len(chunk) > fade_samples:
            overlap_region = result[-fade_samples:] + chunk[:fade_samples]
            result[-fade_samples:] = overlap_region
            result = _np.concatenate([result, chunk[fade_samples:]])
        else:
            result = _np.concatenate([result, chunk])

    return result


def _generate_single_sentence(text, model, kwargs_base):
    """Gera audio de uma unica frase."""
    sentence_kwargs = kwargs_base.copy()
    sentence_kwargs["text"] = text
    sentence_kwargs["preprocess_prompt"] = False  # Desativar preprocess por frase
    audio_list = model.generate(**sentence_kwargs)
    return audio_list[0]


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
        "crossfade": CROSSFADE_ENABLED,
        "kokoro_url": KOKORO_URL or "not configured",
        "endpoints": {
            "health": "GET /health",
            "status": "GET /api/maint/status",
            "cleanup": "POST /api/maint/cleanup",
            "generate": "POST /api/native-generate",
            "smart_generate": "POST /api/smart-generate",
            "router_status": "GET /api/router/status",
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
    """Decide se deve rotear para Kokoro em vez de OmniVoice.

    Retorna True SE:
    1. Kokoro esta configurado E disponivel
    2. A geracao NAO precisa de clonagem/design (Kokoro nao suporta)
    3. A GPU esta sob carga (VRAM alta OU multiplas requisicoes simultaneas)
    """
    global KOKORO_ENABLED

    if not KOKORO_URL:
        return False

    # Clonagem e voice design SEMPRE vao pro OmniVoice
    if voice_mode in ("clone", "design") or has_ref_audio:
        return False

    # Verificar VRAM
    if torch.cuda.is_available():
        _, reserv, pct = _get_vram()
        if pct > KOKORO_VRAM_THRESHOLD:
            print(f"[Router] VRAM em {pct:.0f}% > threshold {KOKORO_VRAM_THRESHOLD}% — roteando para Kokoro")
            return True

    # Verificar profundidade da fila (se tem mais de 1 req simultanea, desviar para Kokoro)
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
    """Endpoint inteligente: roteia automaticamente entre OmniVoice e Kokoro-82M.

    Logica de roteamento:
    - clone/design -> SEMPRE OmniVoice (Kokoro nao suporta)
    - auto sem ref audio + GPU sob carga -> Kokoro
    - auto sem ref audio + GPU livre -> OmniVoice
    - Kokoro indisponivel -> OmniVoice (fallback)

    Mesma interface do native-generate. Transparente pro frontend.
    """
    try:
        body = await request.json()

        voice_mode = body.get("voice_mode", "auto")
        has_ref_audio = bool(body.get("ref_audio_url") or body.get("ref_audio_base64"))

        # Decidir: OmniVoice ou Kokoro?
        use_kokoro = _should_use_kokoro(voice_mode, has_ref_audio)

        if use_kokoro:
            # Incrementar fila
            with _queue_lock:
                global _queue_depth
                _queue_depth += 1

            try:
                result = await _forward_to_kokoro(body)
                if result and result.get("status") == "ok":
                    return JSONResponse(result)
                # Se Kokoro falhou, cai pra OmniVoice abaixo
            finally:
                with _queue_lock:
                    _queue_depth = max(0, _queue_depth - 1)

        # OmniVoice (padrao ou fallback do Kokoro)
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
        "guidance_scale": 2.0,
        "denoise": true,
        "postprocess_output": true,
        "preprocess_prompt": true,
        "duration": null  (opcional, forca duracao em segundos)
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
        denoise = body.get("denoise", True) == True
        postprocess_output = body.get("postprocess_output", True) == True
        preprocess_prompt = body.get("preprocess_prompt", True) == True
        duration = body.get("duration", None)
        if duration is not None:
            try:
                duration = float(duration)
                if duration <= 0:
                    duration = None
            except (ValueError, TypeError):
                duration = None
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
            "denoise": denoise,
            "postprocess_output": postprocess_output,
            "preprocess_prompt": preprocess_prompt,
        }

        if duration is not None:
            kwargs["duration"] = duration

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

        # ============================================================
        # GERACAO COM CROSSFADE (textos longos) ou geracao normal
        # ============================================================
        print(f"[Native] Gerando: mode={voice_mode} speed={speed} cfg={guidance_scale} steps={num_step} denoise={denoise} postprocess={postprocess_output} preprocess={preprocess_prompt} dur={duration} text=\"{text[:60]}...\"")
        start = time.time()

        loop = asyncio.get_event_loop()

        if CROSSFADE_ENABLED and len(text.strip()) > CROSSFADE_MIN_LEN and preprocess_prompt:
            # MODO CROSSFADE: dividir em frases, gerar cada uma, juntar com crossfade
            sentences = _split_sentences(text.strip())
            print(f"[Crossfade] Texto dividido em {len(sentences)} frases")

            # Gerar cada frase
            audio_chunks = []
            kwargs_base = {k: v for k, v in kwargs.items() if k != 'text'}
            for i, sentence in enumerate(sentences):
                print(f"[Crossfade] Frase {i+1}/{len(sentences)}: \"{sentence[:50]}...\"")
                try:
                    audio_chunk = await loop.run_in_executor(
                        None, _generate_single_sentence, sentence, _model, kwargs_base
                    )
                    audio_chunks.append(audio_chunk)
                    print(f"[Crossfade] Frase {i+1} OK: {len(audio_chunk)/SAMPLE_RATE:.1f}s")
                except Exception as e:
                    print(f"[Crossfade] Frase {i+1} ERRO: {e}, tentando geracao normal...")
                    audio_chunks = []
                    break

            if len(audio_chunks) > 1:
                # Juntar com crossfade
                audio_array = _crossfade_audio(audio_chunks)
                print(f"[Crossfade] {len(audio_chunks)} frases concatenadas com crossfade ({CROSSFADE_MS}ms)")
            elif len(audio_chunks) == 1:
                audio_array = audio_chunks[0]
            else:
                # Fallback: geracao normal
                audio_array = (await loop.run_in_executor(None, lambda: _model.generate(**kwargs)))[0]
        else:
            # MODO NORMAL: geracao direta (texto curto ou crossfade desativado)
            audio_array = (await loop.run_in_executor(None, lambda: _model.generate(**kwargs)))[0]

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
    print(f"       GET  /health                 (health check)")
    print(f"       GET  /api/maint/status       (VRAM + info)")
    print(f"       POST /api/maint/cleanup      (forcar deep cleanup)")
    print(f"       POST /api/native-generate    (geracao 100% nativa)")
    print(f"       POST /api/smart-generate     (ROTEADOR: OmniVoice/Kokoro)")
    print(f"       GET  /api/router/status       (status do roteador)")
    print(f"  [OK] Crossfade: {'ATIVADO' if CROSSFADE_ENABLED else 'DESATIVADO'} (>{CROSSFADE_MIN_LEN} chars)")
    if KOKORO_URL:
        print(f"  [OK] Kokoro fallback: {KOKORO_URL}")
    else:
        print(f"  [--] Kokoro fallback: nao configurado (set KOKORO_URL=http://localhost:7861)")
    print("=" * 55)

    # Subir servidor com uvicorn
    uvicorn.run(app, host=args.ip, port=args.port, log_level="warning")
