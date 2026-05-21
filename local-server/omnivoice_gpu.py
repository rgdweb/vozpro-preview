"""
omnivoice_gpu.py - Wrapper com limites de GPU para RTX 3060 12GB
Aplica patches de memoria e roda omnivoice-demo normalmente.

Limites:
- torch.cuda.set_per_process_memory_fraction(0.85) = ~10.2GB max
- max_memory={0: "10GiB"} = teto duro no from_pretrained
- torch.cuda.empty_cache() = libera cache apos cada geracao

USO: python omnivoice_gpu.py --ip 0.0.0.0 --port 7860
(substitui omnivoice-demo no iniciar.bat)
"""

import sys
import os
import importlib
import importlib.metadata

# ============================================
# 1. APLICAR LIMITES DE GPU
# ============================================
import torch

if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_total = torch.cuda.get_device_properties(0).total_mem / (1024**3)
    print("=" * 55)
    print(f"  GPU Limit Wrapper - {gpu_name}")
    print(f"  VRAM: {gpu_total:.1f} GB")
    print("=" * 55)

    # Limitar a 85% da GPU
    torch.cuda.set_per_process_memory_fraction(0.85)
    print(f"  [OK] Memory fraction: 85% ({gpu_total * 0.85:.1f} GB)")

    # Limpar cache residual
    torch.cuda.empty_cache()
    print(f"  [OK] Cache limpo")

    # ============================================
    # 2. MONKEY-PATCH OmniVoice
    # ============================================
    try:
        from omnivoice import OmniVoice

        _original_from_pretrained = OmniVoice.from_pretrained
        _original_generate = OmniVoice.generate

        @classmethod
        def _patched_from_pretrained(cls, model_name, *args, **kwargs):
            """Intercepta from_pretrained e adiciona max_memory."""
            if 'max_memory' not in kwargs:
                kwargs['max_memory'] = {0: "10GiB"}
            print(f"[GPU] from_pretrained({model_name}) com max_memory={{0: 10GiB}}")
            return _original_from_pretrained.__func__(cls, model_name, *args, **kwargs)

        def _patched_generate(self, *args, **kwargs):
            """Intercepta generate e libera cache GPU apos cada geracao."""
            result = _original_generate(self, *args, **kwargs)
            if torch.cuda.is_available():
                alloc = torch.cuda.memory_allocated(0) / (1024**3)
                reserv = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Apos geracao: {alloc:.2f}GB alloc / {reserv:.2f}GB reservado")
                torch.cuda.empty_cache()
                reserv2 = torch.cuda.memory_reserved(0) / (1024**3)
                print(f"[GPU] Apos empty_cache: {reserv2:.2f}GB reservado")
            return result

        OmniVoice.from_pretrained = _patched_from_pretrained
        OmniVoice.generate = _patched_generate

        print(f"  [OK] OmniVoice patcheado:")
        print(f"       - from_pretrained: max_memory={{0: 10GiB}}")
        print(f"       - generate: empty_cache apos cada geracao")
        print("=" * 55)

    except Exception as e:
        print(f"  [AVISO] Nao conseguiu patchear OmniVoice: {e}")
        print(f"  [AVISO] Rodando sem patches de GPU")
        print("=" * 55)
else:
    print("[AVISO] CUDA nao disponivel, rodando sem limites de GPU")


# ============================================
# 3. DESCOBRIR E RODAR OMNIVOICE-DEMO
# ============================================

def find_and_run_demo():
    """Tenta encontrar o entry point do omnivoice-demo e rodar."""

    # Abordagem 1: Buscar entry point via importlib.metadata
    try:
        eps = importlib.metadata.entry_points()
        # Python 3.10+
        if hasattr(eps, 'select'):
            demo_eps = list(eps.select(group='console_scripts', name='omnivoice-demo'))
        else:
            # Python 3.9
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

    # Abordagem 2: Tentar imports comuns do pacote
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

    # Abordagem 3: Fallback - exec omnivoice-demo como subprocess
    print("[FALLBACK] Executando omnivoice-demo como subprocess...")
    print("[AVISO] GPU patches NAO serao aplicados no subprocess!")
    import subprocess
    args = ['omnivoice-demo'] + sys.argv[1:]
    result = subprocess.run(args)
    sys.exit(result.returncode)

    return False


if __name__ == '__main__':
    find_and_run_demo()
