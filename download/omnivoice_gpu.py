"""
omnivoice_gpu.py - Wrapper com limpeza de GPU para RTX 3060 12GB
Versao LEVE: so empty_cache() apos cada geracao, sem limitar memoria
Endpoints de manutencao: /api/maint/status e /api/maint/cleanup

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
(substitui omnivoice-demo no iniciar.bat)
"""

import sys
import os
import importlib
import importlib.metadata
import gc as _gc

import torch

if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print("=" * 55)
    print(f"  GPU Wrapper - {gpu_name}")
    print(f"  VRAM: {gpu_total:.1f} GB")
    print("=" * 55)
    print(f"  [OK] Cache limpo")
    torch.cuda.empty_cache()

    try:
        from omnivoice import OmniVoice

        _original_generate = OmniVoice.generate

        def _patched_generate(self, *args, **kwargs):
            # LIMPAR CACHE ANTES de gerar (libera VRAM dos modelos intermediarios)
            if torch.cuda.is_available():
                alloc_before = torch.cuda.memory_allocated(0) / (1024**3)
                reserv_before = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Antes geracao: {alloc_before:.2f}GB alloc / {reserv_before:.2f}GB reservado")
                torch.cuda.empty_cache()
            
            result = _original_generate(self, *args, **kwargs)
            
            # LIMPAR CACHE APOS gerar (libera VRAM do resultado)
            if torch.cuda.is_available():
                alloc = torch.cuda.memory_allocated(0) / (1024**3)
                reserv = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Apos geracao: {alloc:.2f}GB alloc / {reserv:.2f}GB reservado")
                torch.cuda.empty_cache()
                # Forcar coleta de lixo do Python (libera tensores nao referenciados)
                _gc.collect()
                torch.cuda.empty_cache()
                reserv2 = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Apos cleanup: {reserv2:.2f}GB reservado")
            return result

        OmniVoice.generate = _patched_generate

        print(f"  [OK] OmniVoice patcheado:")
        print(f"       - generate: empty_cache apos cada geracao")
        print(f"       - SEM max_memory (modelo usa o que precisar)")
        print(f"       - SEM memory_fraction (sem limitar)")

        # ============================================================
        # ENDPOINTS DE MANUTENCAO (acessiveis via tunnel)
        # /api/maint/status  - Verifica VRAM e status da GPU
        # /api/maint/cleanup - Forca limpeza de VRAM
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
                        alloc = torch.cuda.memory_allocated(0) / (1024**3)
                        reserv = torch.cuda.memory_reserved(0) / (1024**3)
                        info = {
                            "cuda": torch.cuda.is_available(),
                            "gpu": gpu_name if torch.cuda.is_available() else None,
                            "vram_total_gb": round(gpu_total, 1) if torch.cuda.is_available() else 0,
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_free_gb": round((gpu_total - reserv), 2) if torch.cuda.is_available() else 0,
                            "vram_percent": round((reserv / gpu_total) * 100, 1) if torch.cuda.is_available() and gpu_total > 0 else 0,
                        }
                        return JSONResponse(info)

                    async def _maint_cleanup(request):
                        _gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                            _gc.collect()
                            torch.cuda.empty_cache()
                        alloc = torch.cuda.memory_allocated(0) / (1024**3)
                        reserv = torch.cuda.memory_reserved(0) / (1024**3)
                        return JSONResponse({
                            "status": "ok",
                            "vram_alloc_gb": round(alloc, 2),
                            "vram_reserved_gb": round(reserv, 2),
                            "vram_freed_gb": "verificado",
                        })

                    # Registrar rotas no app do Gradio
                    _app.add_api_route("/api/maint/status", _maint_status, methods=["GET"])
                    _app.add_api_route("/api/maint/cleanup", _maint_cleanup, methods=["POST"])
                    print(f"  [OK] Endpoints de manutencao ativos:")
                    print(f"       GET  /api/maint/status  (VRAM da GPU)")
                    print(f"       POST /api/maint/cleanup (forcar limpeza)")
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
