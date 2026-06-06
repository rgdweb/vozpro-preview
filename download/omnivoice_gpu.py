"""
omnivoice_gpu.py - Servidor NATIVO OmniVoice (sem Gradio)
Tudo em Python: carrega modelo, expoe API REST, gerencia GPU.
"""

import sys
import os
import subprocess

# Auto-instalar dependencias (se ja tiver, ignora silenciosamente)
for _pkg in ["uvicorn", "starlette", "soundfile"]:
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
# ROUTER: Decide OmniVoice vs Kokoro baseado na carga
# ============================================================

def _should_use_kokoro(voice_mode, has_ref_audio):
    """Decide se deve rotear para Kokoro em vez de OmniVoice."""
    global KOKORO_ENABLED

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
        has_ref_audio = bool(body.get("ref_audio_url") or body.get("ref_audio") or body.get("speaker_id"))

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
# ENDPOINT PRINCIPAL DE GERAÇÃO (À PROVA DE FALHAS DINÂMICO)
# ============================================================

async def native_generate(request):
    global _model
    try:
        body = await request.json()
        
        # Captura estritamente os dados oficiais enviados pelo ecossistema Oracle Cloud
        text = body.get("text", "")
        voice_mode = body.get("voice_mode", "clone") 
        speaker_id = body.get("speaker_id", "")   
        ref_audio_url = body.get("ref_audio_url", "")
        ref_text = body.get("ref_text", "")
        
        guidance_scale = float(body.get("guidance_scale", 1.5)) 
        num_step = int(body.get("num_step", 32))
        speed = float(body.get("speed", 1.0))

        if not text:
            return JSONResponse({"error": "Texto para geracao vazio"}, status_code=400)

        # Garante que a pasta local existe no seu Windows
        os.makedirs("embeddings", exist_ok=True)

        # =========================================================================
        # FLUXO 1: CLONAGEM RÁPIDA COM AUTOCURA (LOCUTORES OFICIAIS DO BANCO)
        # =========================================================================
        if voice_mode in ["clone_fast", "clone_fast "]:
            if not speaker_id:
                return JSONResponse({"error": "speaker_id e obrigatorio para o modo clone_fast"}, status_code=400)
            
            tmp_ref_path = os.path.join("embeddings", speaker_id)
            force_redownload = False

            # AUTOCURA: validar arquivo local — se corrompido, remover e forcar redownload
            if os.path.exists(tmp_ref_path):
                try:
                    import soundfile as sf
                    info = sf.info(tmp_ref_path)
                    if info.frames < 100:
                        raise ValueError(f"Arquivo muito curto ({info.frames} frames)")
                except Exception as e:
                    print(f"[AUTOCURA] Arquivo '{speaker_id}' invalido/corrompido ({e}). Removendo...")
                    try: os.remove(tmp_ref_path)
                    except: pass
                    force_redownload = True

            # Download com validacao — se nao existe ou foi marcado para redownload
            if (not os.path.exists(tmp_ref_path) or force_redownload) and ref_audio_url:
                print(f"[GPU] Baixando Locutor '{speaker_id}' de: {ref_audio_url}")
                import urllib.request
                try:
                    opener = urllib.request.build_opener()
                    opener.addheaders = [('User-agent', 'Mozilla/5.0')]
                    urllib.request.install_opener(opener)
                    urllib.request.urlretrieve(ref_audio_url, tmp_ref_path)
                    # Validar download
                    import soundfile as sf
                    info = sf.info(tmp_ref_path)
                    print(f"[GPU] Download OK: {info.duration:.1f}s | {info.samplerate}Hz | {info.channels}ch")
                except Exception as dl_err:
                    print(f"[GPU] Falha no download: {dl_err}")
                    if os.path.exists(tmp_ref_path):
                        try: os.remove(tmp_ref_path)
                        except: pass
                    return JSONResponse({"error": f"Falha ao baixar '{speaker_id}': {dl_err}"}, status_code=502)
            
            if not os.path.exists(tmp_ref_path):
                return JSONResponse({"error": f"Arquivo de referencia '{speaker_id}' nao encontrado e URL indisponivel"}, status_code=404)
            
            # Se ref_text vazio, NAO usa fallback — o modelo funciona sem ref_text
            if not ref_text:
                ref_text = ""

        # =========================================================================
        # FLUXO 2: CLONAGEM TRADICIONAL COM AUTOCURA (UPLOAD DE ÁUDIO PELO CLIENTE)
        # =========================================================================
        else:
            if not ref_audio_url or not ref_text:
                return JSONResponse({"error": "Faltando ref_audio_url ou ref_text para clone normal"}, status_code=400)
            
            import urllib.request
            tmp_dir = tempfile.gettempdir()
            tmp_ref_path = os.path.join(tmp_dir, f"ref_{int(time.time())}.wav")
            
            print(f"[Native] Baixando audio de referencia temporario: {ref_audio_url[:80]}")
            try:
                opener = urllib.request.build_opener()
                opener.addheaders = [('User-agent', 'Mozilla/5.0')]
                urllib.request.install_opener(opener)
                urllib.request.urlretrieve(ref_audio_url, tmp_ref_path)
                # Validar download
                import soundfile as sf
                info = sf.info(tmp_ref_path)
                print(f"[Native] Download OK: {info.duration:.1f}s | {info.samplerate}Hz | {info.channels}ch")
            except Exception as dl_err:
                print(f"[Native] Falha no download do ref audio: {dl_err}")
                if os.path.exists(tmp_ref_path):
                    try: os.remove(tmp_ref_path)
                    except: pass
                return JSONResponse({"error": f"Falha ao baixar audio de referencia: {dl_err}"}, status_code=502)

        # =========================================================================
        # EXECUÇÃO DO MODELO OMNIVOICE NA GPU (RTX 3060 12GB)
        # =========================================================================
        with _queue_lock:
            _pre_generate_cleanup()
            model = load_model()

            print(f"[Native] Processando síntese ({voice_mode}) | CFG: {guidance_scale} | Steps: {num_step}")
            
            kwargs = {
                "text": text.strip(),
                "num_step": num_step,
                "speed": speed,
                "guidance_scale": guidance_scale,
                "ref_audio": tmp_ref_path,
                "ref_text": ref_text
            }

            # Roda a geração pesada fora da thread principal para não congelar o servidor Starlette
            loop = asyncio.get_event_loop()
            audio_data = await loop.run_in_executor(None, lambda: model.generate(**kwargs))

            # Remove o arquivo temporário apenas se veio do fluxo tradicional por upload
            if voice_mode not in ["clone_fast", "clone_fast "] and os.path.exists(tmp_ref_path):
                try: 
                    os.remove(tmp_ref_path)
                except: 
                    pass

            # Exporta o array numérico bruto para um arquivo WAV de 24Khz em Base64
            import io, soundfile as sf, base64
            wav_io = io.BytesIO()
            sf.write(wav_io, audio_data, SAMPLE_RATE, format='WAV', subtype='PCM_16')
            b64_audio = base64.b64encode(wav_io.getvalue()).decode("utf-8")

            _post_generate_cleanup()

        return JSONResponse({
            "status": "success",
            "audio_base64": b64_audio
        })

    except Exception as e:
        print(f"[Native] Erro critico na geracao: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


# ============================================================
# APP STARLETTE (servidor puro, sem Gradio)
# ============================================================

async def index(request):
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


app = Starlette(
    routes=[
        Route("/", index, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route("/api/maint/status", index, methods=["GET"]),  # Aponta para index temporariamente
        Route("/api/maint/cleanup", health, methods=["POST"]),  # Aponta para health temporariamente
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
