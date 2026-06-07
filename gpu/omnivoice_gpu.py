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
        ref_audio_base64 = body.get("ref_audio_base64", "")
        ref_text = body.get("ref_text", "")
        
        guidance_scale = float(body.get("guidance_scale", 2.0))
        num_step = int(body.get("num_step", 32))
        speed = float(body.get("speed", 1.0))

        if not text:
            return JSONResponse({"error": "Texto para geracao vazio"}, status_code=400)

        # -------------------------------------------------------------------------
        # SISTEMA DE RAIO V5 - CACHE MODULAR EM DISCO POR SUBPASTAS DE LOCUTOR
        # -------------------------------------------------------------------------
        base_embeddings_dir = "embeddings"
        os.makedirs(base_embeddings_dir, exist_ok=True)
        ref_audio_path = ""
        is_clone_fast = voice_mode in ("clone_fast", "clone_fast  ")

        # Limpa o identificador do locutor para criar um nome de pasta valido no Windows
        speaker_clean = "".join([c for c in str(speaker_id) if c.isalnum() or c in ('_', '-')]).strip() if speaker_id else ""

        # PASSO 1: CHECAGEM DO CACHE MODULAR NO SSD (VOZES OFICIAIS)
        if is_clone_fast and speaker_clean:
            # Cria a pasta exclusiva do locutor dentro de embeddings/
            speaker_dir = os.path.join(base_embeddings_dir, speaker_clean)
            os.makedirs(speaker_dir, exist_ok=True)
            
            # Identifica a referencia unica pelo tamanho do Base64 ou URL para gerar o nome do arquivo .wav
            import hashlib
            ref_identifier = ""
            if ref_audio_base64:
                ref_identifier = hashlib.md5(str(ref_audio_base64).encode('utf-8')).hexdigest()
            elif ref_audio_url:
                ref_identifier = hashlib.md5(str(ref_audio_url).encode('utf-8')).hexdigest()
                
            if ref_identifier:
                nome_wav_referencia = f"ref_{ref_identifier}.wav"
                caminho_completo_cache = os.path.join(speaker_dir, nome_wav_referencia)
                
                # Se o arquivo dessa referencia ja existe no SSD do locutor, ATIVA O RAIO INSTANTANEO
                if os.path.exists(caminho_completo_cache):
                    print(f"[SISTEMA RAIO] Referencia '{nome_wav_referencia}' lida do SSD na pasta '{speaker_clean}'! Latencia zero.")
                    ref_audio_path = caminho_completo_cache

        # PASSO 2: CONTINGENCIA - DECODIFICACAO DO PAYLOAD SE NAO ESTIVER NO CACHE DO SSD
        if not ref_audio_path:
            try:
                audio_data = None
                
                # Prioridade Maxima: Le os dados puros enviados em Base64 do payload da nuvem
                if ref_audio_base64 and str(ref_audio_base64).strip():
                    b64 = str(ref_audio_base64).strip()
                    if ',' in b64 and b64.startswith('data:'):
                        b64 = b64.split(',', 1)[1]
                    audio_data = base64.b64decode(b64)
                    print(f"[Native] Decodificando dados em Base64 recebidos do payload: {len(audio_data)} bytes.")
                
                # Fallback secundario: busca a URL da internet caso o Base64 venha nulo
                elif ref_audio_url and str(ref_audio_url).strip():
                    import urllib.request, ssl
                    req = urllib.request.Request(ref_audio_url, headers={'User-Agent': 'OmniVoice/1.0'})
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                        audio_data = resp.read()
                    print(f"[Native] Fallback: Baixando audio de referencia da internet...")

                if audio_data:
                    # Se for locutor oficial (clone_fast), salva na subpasta dele permanentemente para cache futuro
                    if is_clone_fast and speaker_clean and ref_identifier:
                        ref_audio_path = os.path.join(base_embeddings_dir, speaker_clean, f"ref_{ref_identifier}.wav")
                        with open(ref_audio_path, "wb") as f:
                            f.write(audio_data)
                        print(f"[Cache-Gravado] Nova referencia salva no SSD: {speaker_clean}/ref_{ref_identifier}.wav")
                    else:
                        # Se for upload comum e temporario de cliente, joga no diretório temp do Windows
                        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                            f.write(audio_data)
                            ref_audio_path = f.name
            except Exception as e:
                print(f"[Erro Processamento Audio] Falha ao processar referencia: {e}")

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
                "ref_audio": ref_audio_path,
                "ref_text": ref_text
            }

            # Roda a geração pesada fora da thread principal para não congelar o servidor Starlette
            loop = asyncio.get_event_loop()
            audio_list = await loop.run_in_executor(None, lambda: model.generate(**kwargs))
            audio_data = audio_list[0]  # Modelo retorna lista de arrays, pegar o primeiro

            # Remove o arquivo temporario APENAS se NAO estiver na pasta de cache embeddings/
            if ref_audio_path and "embeddings" not in ref_audio_path and os.path.exists(ref_audio_path):
                try: os.unlink(ref_audio_path)
                except: pass

            # Exporta o array numérico bruto para um arquivo WAV de 24Khz em Base64
            import io, soundfile as sf, base64
            import numpy as np
            wav_io = io.BytesIO()
            if hasattr(audio_data, "cpu"):
                audio_data = audio_data.cpu().numpy()
            # Mantém o áudio em float32 estável e plano. O soundfile converte nativamente para PCM_16 sem distorcer o som
            audio_float32 = np.asarray(audio_data, dtype=np.float32).flatten()
            sf.write(wav_io, audio_float32, SAMPLE_RATE, format='WAV', subtype='PCM_16')
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
