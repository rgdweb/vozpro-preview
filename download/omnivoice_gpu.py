"""
omnivoice_gpu.py - Wrapper com manutencao AUTOMATICA de GPU para RTX 3060 12GB
Tudo automatico: monitor em background, cleanup inteligente, sem interacao humana.

Manutencao automatica:
- Monitor em background: verifica VRAM a cada 3 min, limpa se > 70%
- Pre-geracao: se VRAM > 80%, faz cleanup agressivo antes de gerar
- Pos-geracao: empty_cache + gc.collect (ja existia)
- Deep cleanup: a cada 5 geracoes, faz cleanup triplo com delays
- Tudo sem botao, sem painel, 100% automatico

Endpoints (mantidos para debug):
  GET  /api/maint/status  - VRAM da GPU
  POST /api/maint/cleanup - forcar limpeza

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
        # ENDPOINTS DE MANUTENCAO (para debug, mantidos)
        # Gradio 6.x: registrar rotas via mount ANTES do launch para
        # evitar que o middleware do Gradio intercepte e cause TypeError
        # ============================================================
        try:
            import gradio as gr
            from starlette.applications import Starlette
            from starlette.routing import Route, Mount
            from starlette.responses import JSONResponse as _JSONResponse

            _orig_launch = gr.Blocks.launch

            def _patched_launch(self, *args, **kwargs):
                try:
                    _app = self.app  # Cria o app FastAPI do Gradio

                    async def _maint_status(request):
                        _gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                        alloc, reserv, pct = _get_vram()
                        return _JSONResponse({
                            "cuda": torch.cuda.is_available(),
                            "gpu": gpu_name if torch.cuda.is_available() else None,
                            "vram_total_gb": round(gpu_total, 1) if torch.cuda.is_available() else 0,
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_free_gb": round((gpu_total - reserv), 2) if torch.cuda.is_available() else 0,
                            "vram_percent": round(pct, 1),
                            "gen_counter": _gen_counter,
                            "auto_cleanup": "active",
                        })

                    async def _maint_cleanup(request):
                        _deep_cleanup("API")
                        alloc, reserv, pct = _get_vram()
                        return _JSONResponse({
                            "status": "ok",
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_percent": round(pct, 1),
                        })

                    # Gradio 6.x: usar add_api_route com include_in_schema=False
                    # para evitar que o middleware do Gradio intercepte
                    _app.add_api_route(
                        "/api/maint/status",
                        _maint_status,
                        methods=["GET"],
                        include_in_schema=False
                    )
                    _app.add_api_route(
                        "/api/maint/cleanup",
                        _maint_cleanup,
                        methods=["POST"],
                        include_in_schema=False
                    )
                    print(f"  [OK] Endpoints de manutencao ativos:")
                    print(f"       GET  /api/maint/status  (VRAM + info)")
                    print(f"       POST /api/maint/cleanup (forcar deep cleanup)")
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
