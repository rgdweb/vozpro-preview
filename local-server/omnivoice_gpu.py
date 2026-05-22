"""
omnivoice_gpu.py - Wrapper com limpeza de GPU para RTX 3060 12GB
Versao LEVE: so empty_cache() apos cada geracao, sem limitar memoria

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
(substitui omnivoice-demo no iniciar.bat)
"""

import sys
import os
import importlib
import importlib.metadata

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
                import gc
                gc.collect()
                torch.cuda.empty_cache()
                reserv2 = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Apos cleanup: {reserv2:.2f}GB reservado")
            return result

        OmniVoice.generate = _patched_generate

        print(f"  [OK] OmniVoice patcheado:")
        print(f"       - generate: empty_cache apos cada geracao")
        print(f"       - SEM max_memory (modelo usa o que precisar)")
        print(f"       - SEM memory_fraction (sem limitar)")
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
