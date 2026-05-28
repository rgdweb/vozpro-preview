"""
omnivoice_gpu.py - Wrapper com manutencao AUTOMATICA de GPU para RTX 3060 12GB
Tudo automatico: monitor em background, cleanup inteligente, sem interacao humana.

Manutencao automatica:
- Monitor em background: verifica VRAM a cada 3 min, limpa se > 70%
- Pre-geracao: se VRAM > 80%, faz cleanup agressivo antes de gerar
- Pos-geracao: empty_cache + gc.collect (ja existia)
- Deep cleanup: a cada 5 geracoes, faz cleanup triplo com delays
- Tudo sem botao, sem painel, 100% automatico

Endpoints:
  GET  /api/maint/status  - VRAM da GPU
  POST /api/maint/cleanup - forcar limpeza
  POST /api/native-generate - Geracao 100% nativa (JSON -> OmniVoice -> WAV base64)

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
(substitui omnivoice-demo no iniciar.bat)
"""

import sys
import os
import importlib
import importlib.metadata
import gc as _gc
import threading
import time

import torch

# ============================================================
# MANUTENCAO AUTOMATICA INTELIGENTE
# ============================================================

_gen_counter = 0
_gen_counter_lock = threading.Lock()
_global_model = None  # Referencia para API nativa (/api/native-generate)


def _get_vram():
    """Retorna (allocated_gb, reserved_gb, usage_percent)."""
    if not torch.cuda.is_available():
        return 0, 0, 0
    alloc = torch.cuda.memory_allocated(0) / (1024**3)
    reserv = torch.cuda.memory_reserved(0) / (1024**3)
    pct = (reserv / gpu_total) * 100 if gpu_total > 0 else 0
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
    # Espera 30s na primeira vez (deixar o servidor subir)
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


if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print("=" * 55)
    print(f"  GPU Wrapper - {gpu_name}")
    print(f"  VRAM: {gpu_total:.1f} GB")
    print("=" * 55)
    print(f"  [OK] Cache limpo")
    torch.cuda.empty_cache()

    # Iniciar monitor automatico em background (daemon = morre com o processo)
    _monitor_thread = threading.Thread(target=_background_monitor, daemon=True)
    _monitor_thread.start()
    print(f"  [OK] Monitor automatico ativo (verifica a cada 3 min)")

    try:
        from omnivoice import OmniVoice

        _original_generate = OmniVoice.generate

        def _patched_generate(self, *args, **kwargs):
            global _gen_counter

            if torch.cuda.is_available():
                alloc, reserv, pct = _get_vram()
                print(f"[GPU] Antes geracao: {alloc:.2f}GB alloc / {reserv:.2f}GB reserv ({pct:.0f}%)")

                # INTELIGENTE: se VRAM > 80%, fazer cleanup pre-geracao
                if pct > 80:
                    print(f"[GPU] VRAM alta ({pct:.0f}%) — cleanup automatico antes de gerar")
                    _smart_cleanup("Pre")
                    _, reserv2, pct2 = _get_vram()
                    # Se ainda > 90%, deep cleanup com delays
                    if pct2 > 90:
                        print(f"[GPU] VRAM critica ({pct2:.0f}%) — deep cleanup")
                        _deep_cleanup("Pre")
                else:
                    torch.cuda.empty_cache()

            result = _original_generate(self, *args, **kwargs)

            if torch.cuda.is_available():
                # Cleanup pos-geracao
                _smart_cleanup("Pos")

                # Contador: a cada 5 geracoes, deep cleanup preventivo
                with _gen_counter_lock:
                    _gen_counter += 1
                    count = _gen_counter
                    if _gen_counter >= 5:
                        _gen_counter = 0
                        _deep_cleanup("Auto5")

                _, reserv_f, pct_f = _get_vram()
                print(f"[GPU] Apos geracao #{count}: {reserv_f:.2f}GB ({pct_f:.0f}%)")

                # Aviso se VRAM ainda alta apos cleanup
                if pct_f > 85:
                    print(f"[GPU] AVISO: VRAM ainda alta ({pct_f:.0f}%) apos cleanup — monitor vai verificar")

            return result

        OmniVoice.generate = _patched_generate

        print(f"  [OK] OmniVoice patcheado com manutencao automatica:")
        print(f"       - Pre-geracao: cleanup se VRAM > 80%")
        print(f"       - Pos-geracao: cleanup inteligente")
        print(f"       - Deep cleanup: a cada 5 geracoes")
        print(f"       - Monitor: verifica a cada 3 min")

        # ============================================================
        # CAPTURAR MODELO PARA API NATIVA
        # ============================================================
        _original_from_pretrained = OmniVoice.from_pretrained

        def _patched_from_pretrained(*args, **kwargs):
            global _global_model
            model = _original_from_pretrained(*args, **kwargs)
            _global_model = model
            print(f"  [OK] Modelo capturado para API nativa")
            return model

        OmniVoice.from_pretrained = _patched_from_pretrained

        # ============================================================
        # ENDPOINT NATIVO (/api/native-generate)
        # Gera audio diretamente com OmniVoice, sem passar pelo Gradio.
        # 100% do pipeline em Python — mesmo comportamento do localhost.
        # ============================================================
        async def _native_generate_handler(request):
            """Endpoint nativo: JSON -> OmniVoice.generate() -> WAV base64."""
            import asyncio
            import tempfile
            import base64
            import io
            import time as _time
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

                if _global_model is None:
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
                        elif ref_audio_base64:
                            b64 = ref_audio_base64
                            if ',' in b64 and b64.startswith('data:'):
                                b64 = b64.split(',', 1)[1]
                            audio_data = base64.b64decode(b64)

                        if audio_data:
                            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                                f.write(audio_data)
                                ref_audio_path = f.name
                            print(f"[Native] Ref audio: {len(audio_data)} bytes")
                    except Exception as e:
                        print(f"[Native] Erro ref audio: {e}")

                # Montar kwargs — EXATAMENTE como OmniVoice funciona no localhost
                kwargs = {
                    "text": text.strip(),
                    "num_step": num_step,
                    "speed": speed,
                }

                if ref_audio_path:
                    kwargs["ref_audio"] = ref_audio_path

                if instruct and instruct.strip():
                    kwargs["instruct"] = instruct.strip()

                if ref_text and ref_text.strip():
                    kwargs["ref_text"] = ref_text.strip()

                if language and language.lower() != "auto":
                    kwargs["language"] = language

                # Gerar em thread pool (OmniVoice.generate e sincrono)
                print(f"[Native] Gerando: mode={voice_mode} speed={speed} steps={num_step} cfg={guidance_scale} text=\"{text[:50]}...\"")
                start = _time.time()

                loop = asyncio.get_event_loop()
                audio_list = await loop.run_in_executor(
                    None, lambda: _global_model.generate(**kwargs)
                )
                audio_array = audio_list[0]

                elapsed = _time.time() - start
                duration = len(audio_array) / 24000
                rtf = elapsed / duration if duration > 0 else 0
                print(f"[Native] OK: {elapsed:.2f}s (duracao={duration:.1f}s, RTF={rtf:.3f})")

                # Converter para WAV
                buf = io.BytesIO()
                _sf.write(buf, audio_array, 24000, format='WAV')
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
        # ENDPOINTS DE MANUTENCAO (para debug, mantidos)
        # ============================================================
        try:
            import gradio as gr
            _orig_launch = gr.Blocks.launch

            def _patched_launch(self, *args, **kwargs):
                try:
                    _app = self.app  # Cria o app FastAPI do Gradio
                    from starlette.responses import JSONResponse

                    async def _maint_status(request):
                        _gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                        alloc, reserv, pct = _get_vram()
                        info = {
                            "cuda": torch.cuda.is_available(),
                            "gpu": gpu_name if torch.cuda.is_available() else None,
                            "vram_total_gb": round(gpu_total, 1) if torch.cuda.is_available() else 0,
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_free_gb": round((gpu_total - reserv), 2) if torch.cuda.is_available() else 0,
                            "vram_percent": round(pct, 1),
                            "gen_counter": _gen_counter,
                            "auto_cleanup": "active",
                        }
                        return JSONResponse(info)

                    async def _maint_cleanup(request):
                        _deep_cleanup("API")
                        alloc, reserv, pct = _get_vram()
                        return JSONResponse({
                            "status": "ok",
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_percent": round(pct, 1),
                        })

                    # Registrar rotas DIRETAMENTE no router (posicao 0)
                    # add_api_route NAO funciona via tunnel — Gradio 6.x middleware intercepta e retorna 404
                    # Inserir Route no inicio de _app.routes garante que chega ANTES do middleware Gradio
                    from starlette.routing import Route

                    _app.routes.insert(0, Route("/api/native-generate", _native_generate_handler, methods=["POST"]))
                    _app.routes.insert(0, Route("/api/maint/status", _maint_status, methods=["GET"]))
                    _app.routes.insert(0, Route("/api/maint/cleanup", _maint_cleanup, methods=["POST"]))
                    print(f"  [OK] Endpoints ativos (rotas diretas, sem Gradio middleware):")
                    print(f"       GET  /api/maint/status       (VRAM + info)")
                    print(f"       POST /api/maint/cleanup      (forcar deep cleanup)")
                    print(f"       POST /api/native-generate     (geracao 100% nativa)")
                except Exception as e:
                    print(f"  [AVISO] Nao conseguiu adicionar endpoints de manutencao: {e}")
                print("=" * 55)
                return _orig_launch(self, *args, **kwargs)

            gr.Blocks.launch = _patched_launch

        except Exception as e:
            print(f"  [AVISO] Nao conseguiu patchear Gradio launch: {e}")
            print("=" * 55)

    except Exception as e:
        print(f"  [AVISO] Nao conseguiu patchear OmniVoice: {e}")
        print("=" * 55)
else:
    print("[AVISO] CUDA nao disponivel, rodando sem limites de GPU")


def find_and_run_demo():
    """Tenta encontrar o entry point do omnivoice-demo e rodar."""

    try:
        eps = importlib.metadata.entry_points()
        if hasattr(eps, 'select'):
            demo_eps = list(eps.select(group='console_scripts', name='omnivoice-demo'))
        else:
            demo_eps = eps.get('console_scripts', {}).get('omnivoice-demo', [])

        if demo_eps:
            ep = demo_eps[0]
            print(f"[START] Entry point: {ep.value}")
            mod_path, func_name = ep.value.split(':')
            mod = importlib.import_module(mod_path)
            func = getattr(mod, func_name)
            func()
            return True
    except Exception as e:
        print(f"[DEBUG] entry_points falhou: {e}")

    common_entries = [
        ('omnivoice.cli', 'main'),
        ('omnivoice.app', 'main'),
        ('omnivoice.demo', 'main'),
        ('omnivoice.server', 'main'),
        ('omnivoice', 'main'),
        ('omnivoice.web', 'main'),
        ('omnivoice.ui', 'main'),
        ('omnivoice.gradio_app', 'main'),
    ]

    for mod_path, func_name in common_entries:
        try:
            mod = importlib.import_module(mod_path)
            if hasattr(mod, func_name):
                print(f"[START] {mod_path}:{func_name}")
                func = getattr(mod, func_name)
                func()
                return True
        except (ImportError, AttributeError):
            continue

    print("[FALLBACK] Executando omnivoice-demo como subprocess...")
    print("[AVISO] GPU patches NAO serao aplicados no subprocess!")
    import subprocess
    args = ['omnivoice-demo'] + sys.argv[1:]
    result = subprocess.run(args)
    sys.exit(result.returncode)
    return False


if __name__ == '__main__':
    find_and_run_demo()
