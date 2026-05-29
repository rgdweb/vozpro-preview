"""
==========================================================
  VozPro - DIAGNOSTICO COMPLETO + AUTO-RESTART
  Script para rodar no servidor local GPU (Windows)
==========================================================

VERIFICA:
  1. GPU NVIDIA (VRAM, temperatura, uso, drivers)
  2. Modelo OmniVoice carregado na memoria
  3. Servidor Gradio rodando (porta 7860)
  4. Tunnel ativo e respondendo (cloudflared ou localtunnel)
  5. URL do tunnel registrada no servidor PHP
  6. Disco livre (C: e D:)
  7. Memoria RAM disponivel
  8. Processos Python rodando
  9. Conexao com internet
  10. Problemas futuros possiveis

AUTO-RESTART:
  - Monitora fila de geracao (via API Vercel)
  - Quando fila esta vazia E ninguem esta gerando ha X minutos
  - Limpa arquivos temporarios
  - Reinicia o servidor Gradio E o tunnel
  - Log de tudo em diagnostico.log

COMO USAR:
  python diagnostico_auto_restart.py

CONFIGURACAO:
  Edite as variaveis CONFIG abaixo conforme seu setup.
"""

import os
import sys
import time
import json
import shutil
import subprocess
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Tuple, List, Dict

# ============================================
# CONFIGURACAO - Edite conforme necessario
# ============================================
CONFIG = {
    # Servidor Gradio (OmniVoice via omnivoice_gpu.py)
    "gradio_port": 7860,
    "gradio_host": "127.0.0.1",

    # Tunnel (cloudflared ou localtunnel)
    "tunnel_process_name": "cloudflared", # cloudflared (prioridade) ou node
    "tunnel_register_url": "https://sorteiomax.com.br/omnivoice/update_tunnel.php",
    "tunnel_auth": "vozpro_tunnel_2024",
    "tunnel_check_url": "https://sorteiomax.com.br/omnivoice/get_tunnel.php",

    # Auto-restart
    # DESATIVADO (24/05/2026): O auto-restart tinha bug critico —
    # taskkill /F /IM python.exe mata o PROPRIE monitor no meio do restart,
    # entao o OmniVoice e tunnel nunca voltavam. Sistema ficava morto.
    # Para reiniciar: execute iniciar_monitor.bat manualmente.
    "auto_restart_enabled": False,
    "idle_minutes_before_restart": 60,
    "check_interval_seconds": 120,
    "max_restarts_per_day": 5,

    # Cleanup de temp
    "cleanup_enabled": True,               # Limpar arquivos temp?
    "temp_max_age_hours": 2,               # Idade maxima de arquivos temp (horas)
    "cleanup_paths": [
        os.environ.get("TEMP", "C:/Temp"),
        os.environ.get("TMP", "C:/Windows/Temp"),
    ],

    # API Vercel (para checar fila)
    "vercel_api_url": "https://omnivoice-umber.vercel.app",
    "vercel_health_endpoint": "/api/health",
    "vercel_queue_endpoint": "/api/queue/join",

    # Alertas
    "gpu_temp_warning": 80,               # C - alerta temperatura GPU
    "gpu_vram_warning": 90,               # % - alerta uso VRAM
    "disk_warning_gb": 5,                 # GB - alerta disco livre
    "ram_warning_percent": 90,            # % - alerta uso RAM

    # Log
    "log_file": "diagnostico.log",
    "max_log_lines": 5000,                # Rotacao de log
}

# ============================================
# UTILITARIOS
# ============================================

LOG_MUTEX = threading.Lock()

def log(msg: str, level: str = "INFO"):
    """Escreve log com timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = {"INFO": "[INFO]", "WARN": "[WARN]", "ERROR": "[ERRO]", "OK": "[ OK ]", "RESTART": "[****]"}
    line = f"{timestamp} {prefix.get(level, '[????]')} {msg}"
    print(line)
    with LOG_MUTEX:
        try:
            with open(CONFIG["log_file"], "a", encoding="utf-8") as f:
                f.write(line + "\n")
            rotate_log()
        except Exception:
            pass

def rotate_log():
    """Rotaciona o log se exceder max_log_lines."""
    try:
        if not os.path.exists(CONFIG["log_file"]):
            return
        with open(CONFIG["log_file"], "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > CONFIG["max_log_lines"]:
            keep = lines[-(CONFIG["max_log_lines"] // 2):]
            with open(CONFIG["log_file"], "w", encoding="utf-8") as f:
                f.writelines(keep)
    except Exception:
        pass

def run_cmd(cmd: str, timeout: int = 30) -> Tuple[int, str]:
    """Executa comando e retorna (exit_code, output)."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return -1, "TIMEOUT"
    except Exception as e:
        return -1, str(e)

def check_internet() -> bool:
    """Verifica se ha conexao com internet."""
    try:
        urllib.request.urlopen("https://www.google.com", timeout=5)
        return True
    except Exception:
        try:
            urllib.request.urlopen("https://1.1.1.1", timeout=5)
            return True
        except Exception:
            return False

def http_get(url: str, timeout: int = 10) -> Tuple[int, str]:
    """Faz GET e retorna (status_code, body)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VozPro-Diag/1.0"})
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")[:500]
    except Exception as e:
        return -1, str(e)

# ============================================
# CHECAGENS DE DIAGNOSTICO
# ============================================

def check_gpu() -> Dict:
    """Verifica status da GPU NVIDIA."""
    log("Verificando GPU NVIDIA...")
    result = {
        "ok": False,
        "name": None,
        "vram_total_mb": 0,
        "vram_used_mb": 0,
        "vram_free_mb": 0,
        "vram_percent": 0,
        "temperature": None,
        "gpu_usage": 0,
        "driver_version": None,
        "cuda_version": None,
    }

    code, output = run_cmd("nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu,driver_version --format=csv,noheader,nounits", 15)
    if code != 0 or not output.strip():
        log("nvidia-smi NAO disponivel - GPU nao encontrada ou drivers nao instalados!", "ERROR")
        code2, output2 = run_cmd("nvidia-smi", 5)
        if code2 != 0:
            log("Comando nvidia-smi falhou completamente. Possiveis causas:", "ERROR")
            log("  1. Placa NVIDIA nao instalada", "ERROR")
            log("  2. Drivers NVIDIA desatualizados ou corrompidos", "ERROR")
            log("  3. CUDA toolkit nao instalado", "ERROR")
        return result

    try:
        parts = [p.strip() for p in output.strip().split(",")]
        if len(parts) >= 7:
            result["name"] = parts[0]
            result["vram_total_mb"] = int(float(parts[1]))
            result["vram_used_mb"] = int(float(parts[2]))
            result["vram_free_mb"] = int(float(parts[3]))
            result["temperature"] = int(parts[4])
            result["gpu_usage"] = int(parts[5])
            result["driver_version"] = parts[6]

            if result["vram_total_mb"] > 0:
                result["vram_percent"] = round((result["vram_used_mb"] / result["vram_total_mb"]) * 100, 1)

            result["ok"] = True
    except (ValueError, IndexError) as e:
        log(f"Erro ao interpretar nvidia-smi: {e}", "ERROR")
        return result

    code, cuda_out = run_cmd("nvcc --version 2>&1 || nvidia-smi | findstr CUDA", 5)
    if "CUDA Version" in cuda_out or "release" in cuda_out.lower():
        result["cuda_version"] = cuda_out.strip()[:100]

    log(f"  GPU: {result['name']}", "OK")
    log(f"  VRAM: {result['vram_used_mb']}/{result['vram_total_mb']} MB ({result['vram_percent']}%)")
    log(f"  Livre: {result['vram_free_mb']} MB | Temp: {result['temperature']}C | Uso: {result['gpu_usage']}%")
    log(f"  Driver: {result['driver_version']} | CUDA: {result['cuda_version'] or 'N/A'}")

    if result["temperature"] and result["temperature"] >= CONFIG["gpu_temp_warning"]:
        log(f"ATENCAO: GPU a {result['temperature']}C! Risco de throttle!", "WARN")
    if result["vram_percent"] >= CONFIG["gpu_vram_warning"]:
        log(f"ATENCAO: VRAM a {result['vram_percent']}%! Pode causar OOM!", "WARN")
    if result["vram_free_mb"] < 1500:
        log(f"ATENCAO: Menos de 1.5GB de VRAM livre! Geracao pode falhar!", "WARN")

    return result

def check_gradio_server() -> Dict:
    """Verifica se o servidor Gradio esta rodando na porta 7860."""
    log("Verificando servidor OmniVoice (porta 7860)...")
    result = {
        "ok": False,
        "running": False,
        "url": f"http://{CONFIG['gradio_host']}:{CONFIG['gradio_port']}",
        "pid": None,
        "response_time_ms": None,
        "model_loaded": False,
    }

    code, output = run_cmd(f'netstat -ano | findstr ":{CONFIG["gradio_port"]}"')
    if "LISTENING" in output:
        result["running"] = True
        try:
            line = [l for l in output.splitlines() if "LISTENING" in l][0]
            result["pid"] = line.strip().split()[-1]
        except (IndexError, ValueError):
            pass

    if result["running"]:
        start_time = time.time()
        status, body = http_get(result["url"], 10)
        elapsed_ms = int((time.time() - start_time) * 1000)
        result["response_time_ms"] = elapsed_ms

        if status == 200:
            result["ok"] = True
            if "OmniVoice" in body or "gradio" in body.lower() or "omnivoice" in body.lower():
                result["model_loaded"] = True
            log(f"  Servidor OK | PID: {result['pid']} | Resposta: {elapsed_ms}ms", "OK")
        else:
            log(f"  Servidor respondendo mas com status {status}!", "WARN")
    else:
        log(f"  Servidor NAO esta rodando na porta {CONFIG['gradio_port']}!", "ERROR")
        log("  Para iniciar: execute iniciar.bat ou python omnivoice_gpu.py --port 7860", "ERROR")

    return result

def check_tunnel() -> Dict:
    """Verifica status do Tunnel (cloudflared ou localtunnel)."""
    log("Verificando Tunnel (Cloudflare/Localtunnel)...")
    result = {
        "ok": False,
        "tunnel_type": None,
        "process_running": False,
        "pid": None,
        "tunnel_url": None,
        "registered_on_server": False,
    }

    # Verificar cloudflared PRIMEIRO (prioridade)
    code, output = run_cmd('tasklist | findstr /I "cloudflared"')
    if "cloudflared" in output.lower():
        result["process_running"] = True
        result["tunnel_type"] = "cloudflared"
        result["ok"] = True  # Tunnel rodando = OK
        log("  Cloudflare Tunnel ativo!", "OK")
    else:
        # Verificar node/npx (localtunnel)
        code2, output2 = run_cmd('tasklist | findstr /I "node.exe"')
        if "node" in output2.lower():
            result["process_running"] = True
            result["tunnel_type"] = "localtunnel"
            result["ok"] = True  # Tunnel rodando = OK
            log("  Localtunnel ativo (via node)!", "OK")
        else:
            log("  Nenhum tunnel rodando! (nem cloudflared, nem node)", "ERROR")
            log("  Para iniciar: execute iniciar_monitor.bat", "ERROR")
            return result

    # Verificar se o tunnel esta registrado no PHP (info extra, nao altera ok)
    status, body = http_get(CONFIG["tunnel_check_url"] + "?auth=" + CONFIG["tunnel_auth"], 10)
    if status == 200:
        try:
            data = json.loads(body)
            tunnel_url = data.get("tunnel_url") or data.get("url")
            if tunnel_url and tunnel_url.startswith("https://"):
                result["tunnel_url"] = tunnel_url
                result["registered_on_server"] = True
                log(f"  URL registrada no servidor: {tunnel_url}", "OK")
            else:
                log(f"  PHP respondeu mas sem URL valida (tunnel funciona localmente)", "WARN")
        except json.JSONDecodeError:
            log(f"  PHP respondeu mas nao conseguiu ler (tunnel funciona localmente)", "WARN")
    else:
        log(f"  Servidor PHP indisponivel (status {status}) - tunnel funciona localmente", "WARN")

    # Verificar se Vercel consegue acessar o tunnel
    status2, _ = http_get(CONFIG["vercel_api_url"] + CONFIG["vercel_health_endpoint"], 15)
    if status2 == 200:
        log("  Vercel acessivel (endpoint /api/health OK)", "OK")
    else:
        log(f"  Vercel /api/health retornou status {status2}", "WARN")

    return result

def check_disk_space() -> Dict:
    """Verifica espaco em disco."""
    log("Verificando disco...")
    result = {"ok": True, "drives": {}}

    drives_to_check = ["C:", "D:"]
    for drive in drives_to_check:
        if os.path.exists(drive + "\\"):
            try:
                total, used, free = shutil.disk_usage(drive)
                free_gb = round(free / (1024**3), 2)
                total_gb = round(total / (1024**3), 2)
                used_percent = round((used / total) * 100, 1)
                result["drives"][drive] = {
                    "total_gb": total_gb,
                    "free_gb": free_gb,
                    "used_percent": used_percent,
                }
                log(f"  {drive}: {free_gb} GB livre de {total_gb} GB ({used_percent}% usado)")

                if free_gb < CONFIG["disk_warning_gb"]:
                    log(f"  ATENCAO: {drive} com menos de {CONFIG['disk_warning_gb']}GB livres!", "WARN")
                    result["ok"] = False
            except Exception as e:
                log(f"  Erro ao verificar {drive}: {e}", "ERROR")
                result["ok"] = False

    return result

def check_ram() -> Dict:
    """Verifica uso de memoria RAM."""
    log("Verificando RAM...")
    result = {"ok": True, "total_gb": 0, "available_gb": 0, "used_percent": 0}

    # Metodo 1: PowerShell com comando simples (retorna numeros diretos)
    code, output = run_cmd(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize; (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"',
        timeout=15
    )

    try:
        if code == 0 and output.strip():
            lines = [l.strip() for l in output.strip().splitlines() if l.strip()]
            nums = []
            for line in lines:
                # Extrair apenas numeros da linha
                num_str = ""
                for ch in line:
                    if ch.isdigit():
                        num_str += ch
                    elif num_str:
                        break
                if num_str:
                    nums.append(int(num_str))

            if len(nums) >= 2:
                total_kb = nums[0]
                free_kb = nums[1]
                if total_kb > 0:
                    used_kb = total_kb - free_kb
                    result["total_gb"] = round(total_kb / (1024**2), 1)
                    result["available_gb"] = round(free_kb / (1024**2), 1)
                    result["used_percent"] = round((used_kb / total_kb) * 100, 1)

                    log(f"  Total: {result['total_gb']} GB | Disponivel: {result['available_gb']} GB ({result['used_percent']}% usado)")

                    if result["used_percent"] >= CONFIG["ram_warning_percent"]:
                        log(f"  ATENCAO: RAM a {result['used_percent']}%! Sistema pode ficar lento!", "WARN")
                        result["ok"] = False
                else:
                    raise ValueError("Valor 0 para RAM total")
            else:
                raise ValueError(f"Nao conseguiu extrair 2 numeros, obteve: {nums}")
        else:
            raise ValueError("PowerShell retornou vazio")
    except Exception:
        # Metodo 2: wmic (fallback)
        code2, output2 = run_cmd(
            'wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /Value 2>nul',
            timeout=10
        )
        try:
            lines = [l.strip() for l in output2.strip().splitlines() if "=" in l]
            mem2 = {}
            for line in lines:
                key, val = line.split("=", 1)
                mem2[key.strip()] = int(val.strip())
            total_kb = mem2.get("TotalVisibleMemorySize", 0)
            free_kb = mem2.get("FreePhysicalMemory", 0)
            if total_kb > 0:
                used_kb = total_kb - free_kb
                result["total_gb"] = round(total_kb / (1024**2), 1)
                result["available_gb"] = round(free_kb / (1024**2), 1)
                result["used_percent"] = round((used_kb / total_kb) * 100, 1)
                log(f"  Total: {result['total_gb']} GB | Disponivel: {result['available_gb']} GB ({result['used_percent']}% usado)")

                if result["used_percent"] >= CONFIG["ram_warning_percent"]:
                    log(f"  ATENCAO: RAM a {result['used_percent']}%! Sistema pode ficar lento!", "WARN")
                    result["ok"] = False
            else:
                log("  Nao conseguiu ler dados de RAM (PowerShell e wmic falharam)", "WARN")
                result["ok"] = False
        except Exception:
            log("  Nao conseguiu ler dados de RAM (PowerShell e wmic falharam)", "WARN")
            result["ok"] = False

    return result

def check_reference_audios(base_path: Optional[str] = None) -> Dict:
    """Verifica integridade dos audios de referencia."""
    log("Verificando audios de referencia...")
    result = {"ok": True, "total": 0, "valid": 0, "invalid": [], "warnings": []}

    search_paths = [
        base_path or os.getcwd(),
        "uploads",
        "reference_audios",
        "vozes",
        "voices",
    ]

    audio_extensions = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}

    for search_path in search_paths:
        if not os.path.exists(search_path):
            continue
        for root, dirs, files in os.walk(search_path):
            dirs[:] = [d for d in dirs if d.lower() not in {"node_modules", ".git", "__pycache__", ".next"}]
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in audio_extensions:
                    fpath = os.path.join(root, fname)
                    fsize = os.path.getsize(fpath)
                    result["total"] += 1

                    if fsize < 1024:
                        result["invalid"].append(f"{fname} ({fsize} bytes - muito pequeno!)")
                        result["ok"] = False
                    elif fsize > 50 * 1024 * 1024:
                        result["warnings"].append(f"{fname} ({round(fsize/1024/1024, 1)}MB - muito grande)")
                    else:
                        result["valid"] += 1

    log(f"  Total: {result['total']} audios | Validos: {result['valid']}")
    if result["invalid"]:
        log(f"  PROBLEMAS: {len(result['invalid'])} audios invalidos!", "ERROR")
        for inv in result["invalid"]:
            log(f"    - {inv}", "ERROR")
    if result["warnings"]:
        for warn in result["warnings"]:
            log(f"  AVISO: {warn}", "WARN")

    return result

def check_temp_files() -> Dict:
    """Verifica e limpa arquivos temporarios."""
    log("Verificando arquivos temporarios...")
    result = {"ok": True, "cleaned": 0, "freed_mb": 0.0, "old_files": 0}

    max_age_seconds = CONFIG["temp_max_age_hours"] * 3600
    now = time.time()

    for temp_path in CONFIG["cleanup_paths"]:
        if not temp_path or not os.path.exists(temp_path):
            continue

        try:
            for root, dirs, files in os.walk(temp_path):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    try:
                        fage = now - os.path.getmtime(fpath)
                        if fage > max_age_seconds:
                            result["old_files"] += 1
                            if CONFIG["cleanup_enabled"]:
                                fsize = os.path.getsize(fpath)
                                try:
                                    os.remove(fpath)
                                    result["cleaned"] += 1
                                    result["freed_mb"] += fsize / (1024**2)
                                except (PermissionError, OSError):
                                    pass
                    except (OSError, ValueError):
                        pass
        except (PermissionError, OSError):
            pass

    log(f"  Arquivos antigos: {result['old_files']} | Limpos: {result['cleaned']} | Espaco liberado: {result['freed_mb']:.1f}MB")

    return result

def check_internet_connection() -> Dict:
    """Verifica conexao com internet."""
    log("Verificando internet...")
    result = {"ok": False, "latency_ms": None}

    start = time.time()
    if check_internet():
        result["ok"] = True
        result["latency_ms"] = int((time.time() - start) * 1000)
        log(f"  Internet OK (latencia: {result['latency_ms']}ms)", "OK")
    else:
        log("  SEM conexao com internet! Tunnel nao vai funcionar!", "ERROR")

    return result

def check_python_environment() -> Dict:
    """Verifica ambiente Python e dependencias."""
    log("Verificando ambiente Python...")
    result = {"ok": True, "python_version": None, "torch_version": None, "omnivoice": False, "gradio": False}

    code, output = run_cmd("python --version 2>&1", 5)
    if code == 0:
        result["python_version"] = output.strip()
        log(f"  Python: {result['python_version']}", "OK")
    else:
        log("  Python NAO encontrado!", "ERROR")
        result["ok"] = False
        return result

    code, output = run_cmd("python -c \"import torch; print(torch.__version__)\" 2>&1", 10)
    if code == 0:
        result["torch_version"] = output.strip()
        log(f"  PyTorch: {result['torch_version']}", "OK")
    else:
        log("  PyTorch NAO encontrado!", "ERROR")
        result["ok"] = False

    code, output = run_cmd("python -c \"import omnivoice; print('OK')\" 2>&1", 10)
    result["omnivoice"] = code == 0
    if code == 0:
        log("  OmniVoice: instalado", "OK")
    else:
        log("  OmniVoice NAO encontrado! pip install omnivoice", "ERROR")
        result["ok"] = False

    code, output = run_cmd("python -c \"import gradio; print(gradio.__version__)\" 2>&1", 10)
    result["gradio"] = code == 0
    if code == 0:
        log(f"  Gradio: {output.strip()}", "OK")
    else:
        log("  Gradio NAO encontrado!", "ERROR")
        result["ok"] = False

    code, output = run_cmd("python -c \"import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A')\" 2>&1", 10)
    if code == 0:
        cuda_status = output.strip()
        if "True" in cuda_status:
            log(f"  CUDA: disponivel ({cuda_status.split(',')[1].strip() if ',' in cuda_status else 'GPU'})", "OK")
        else:
            log(f"  CUDA: NAO disponivel! ({cuda_status})", "ERROR")
            log("  A geracao de audio NAO vai funcionar sem CUDA!", "ERROR")
            result["ok"] = False

    # Verificar se omnivoice_gpu.py existe
    script_dir = os.path.dirname(os.path.abspath(__file__))
    gpu_script = os.path.join(script_dir, "omnivoice_gpu.py")
    if os.path.exists(gpu_script):
        log(f"  omnivoice_gpu.py: encontrado em {script_dir}", "OK")
    else:
        log(f"  omnivoice_gpu.py: NAO encontrado em {script_dir}!", "WARN")

    return result

def check_future_issues() -> List[str]:
    """Identifica possiveis problemas futuros."""
    log("Analisando riscos futuros...")
    issues = []

    # 1. Driver NVIDIA desatualizado
    code, output = run_cmd("nvidia-smi --query-gpu=driver_version --format=csv,noheader", 5)
    if code == 0:
        driver = output.strip()
        try:
            ver = int(driver.replace(".", "")[:3])
            if ver < 520:
                issues.append(f"Driver NVIDIA {driver} pode estar desatualizado. Recomendado: >= 530+")
        except ValueError:
            pass

    # 2. Disco enchendo
    for drive in ["C:", "D:"]:
        if os.path.exists(drive + "\\"):
            try:
                total, used, free = shutil.disk_usage(drive)
                free_gb = round(free / (1024**3), 2)
                if free_gb < 20:
                    issues.append(f"Disco {drive} com apenas {free_gb}GB livres. Pode encher em poucos dias.")
                if free_gb < 5:
                    issues.append(f"CRITICO: Disco {drive} quase cheio! {free_gb}GB livres!")
            except Exception:
                pass

    # 3. Arquivos temporarios acumulando
    for temp_path in CONFIG["cleanup_paths"]:
        if temp_path and os.path.exists(temp_path):
            try:
                count = sum(1 for _ in Path(temp_path).rglob("*") if _.is_file())
                if count > 10000:
                    issues.append(f"Pasta temp {temp_path} com {count} arquivos! Pode causar lentidao.")
            except Exception:
                pass

    # 4. VRAM fragmentation
    code, output = run_cmd("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", 5)
    if code == 0:
        try:
            vram_used = int(float(output.strip()))
            if vram_used > 8000:
                issues.append(f"VRAM usando {vram_used}MB sem gerar ativamente. Possivel memory leak - reinicie o servidor.")
        except ValueError:
            pass

    # 5. Processos Python zumbis
    code, output = run_cmd('tasklist | findstr /I "python"')
    python_count = output.lower().count("python")
    if python_count > 3:
        issues.append(f"{python_count} processos Python rodando! Pode haver processos zumbis. Execute iniciar.bat.")

    # 6. Tunnel nao rodando
    code, output = run_cmd('tasklist | findstr /I "cloudflared"')
    code2, output2 = run_cmd('tasklist | findstr /I "node"')
    if "cloudflared" not in output.lower() and "node" not in output2.lower():
        issues.append("Nenhum tunnel rodando! (nem cloudflared, nem node/localtunnel). Execute iniciar_com_monitor.bat.")

    # 7. Conda ativa
    conda_check = os.environ.get("CONDA_PREFIX", "")
    if not conda_check and "CONDA_DEFAULT_ENV" not in os.environ:
        issues.append("Conda nao parece estar ativa. Execute iniciar.bat em vez de rodar direto.")

    if issues:
        log(f"  {len(issues)} possiveis problemas identificados:")
        for i, issue in enumerate(issues, 1):
            log(f"    {i}. {issue}", "WARN")
    else:
        log("  Nenhum problema futuro identificado!", "OK")

    return issues

# ============================================
# AUTO-RESTART
# ============================================

restart_count = {"count": 0, "last_reset": datetime.now()}

def check_queue_status() -> Dict:
    """Verifica status da fila via API Vercel."""
    result = {"active": False, "queue_count": 0, "processing": False}
    try:
        status, body = http_get(CONFIG["vercel_api_url"] + CONFIG["vercel_queue_endpoint"], 10)
        if status == 200:
            try:
                data = json.loads(body)
                result["queue_count"] = data.get("queueCount", data.get("count", 0))
                result["processing"] = data.get("currentlyProcessing", data.get("processing", False))
                result["active"] = result["queue_count"] > 0 or result["processing"]
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    return result

def do_restart():
    """Executa o restart completo do servidor."""
    log("INICIANDO RESTART AUTOMATICO!", "RESTART")
    log("========================================", "RESTART")

    now = datetime.now()
    if (now - restart_count["last_reset"]).days >= 1:
        restart_count["count"] = 0
        restart_count["last_reset"] = now

    if restart_count["count"] >= CONFIG["max_restarts_per_day"]:
        log(f"Limite de {CONFIG['max_restarts_per_day']} restarts/dia atingido. Abortando.", "ERROR")
        return False

    restart_count["count"] += 1
    log(f"Restart #{restart_count['count']} do dia", "RESTART")

    # 1. Limpar temp
    log("Limpando arquivos temporarios...", "RESTART")
    check_temp_files()

    # 2. Matar tunnels (NAO matar node.exe — pode haver outros processos node)
    log("Parando tunnels (cloudflared)...", "RESTART")
    run_cmd("taskkill /F /IM cloudflared.exe", 10)
    time.sleep(3)

    # 3. Matar OmniVoice (procure pela porta, NAO mate TODOS python.exe!)
    # taskkill /F /IM python.exe mata O PROPRIO MONITOR. Instead, mata so o
    # processo escutando na porta 7860.
    log("Parando servidor OmniVoice...", "RESTART")
    code_ns, output_ns = run_cmd(f'netstat -ano | findstr ":{CONFIG["gradio_port"]}" | findstr "LISTENING"')
    killed_omnivoice = False
    if "LISTENING" in output_ns:
        for line in output_ns.strip().splitlines():
            parts = line.strip().split()
            if parts:
                pid = parts[-1]
                log(f"  Matando PID {pid} (porta {CONFIG['gradio_port']})...", "RESTART")
                run_cmd(f"taskkill /F /PID {pid}", 10)
                killed_omnivoice = True
    if not killed_omnivoice:
        log("  Nenhum processo na porta 7860 encontrado (ja estava parado?)", "RESTART")
    time.sleep(3)

    # 4. Aguardar liberacao
    log("Aguardando liberacao de recursos...", "RESTART")
    time.sleep(5)

    # 5. Reiniciar OmniVoice (mesma logica do iniciar.bat)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    gpu_script = os.path.join(script_dir, "omnivoice_gpu.py")

    if os.path.exists(gpu_script):
        conda_activate = r"C:\Users\Administrador\Miniconda3\Scripts\activate.bat"
        log(f"Reiniciando OmniVoice GPU (porta {CONFIG['gradio_port']})...", "RESTART")
        subprocess.Popen(
            f'cmd /k "call {conda_activate} && set CUDA_VISIBLE_DEVICES=0 && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && python omnivoice_gpu.py --ip 0.0.0.0 --port {CONFIG["gradio_port"]}"',
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
            cwd=script_dir,
            stdout=open(os.path.join(script_dir, "gradio.log"), "a"),
            stderr=open(os.path.join(script_dir, "gradio_error.log"), "a"),
            shell=True,
        )
        log("Servidor OmniVoice iniciado em background", "RESTART")
    else:
        log(f"Script omnivoice_gpu.py NAO encontrado: {gpu_script}", "ERROR")
        log("O servidor NAO foi reiniciado automaticamente. Execute iniciar.bat manualmente.", "ERROR")

    # 6. Aguardar servidor subir
    log("Aguardando servidor subir (30s)...", "RESTART")
    time.sleep(30)

    code, output = run_cmd(f'netstat -ano | findstr ":{CONFIG["gradio_port"]}"')
    if "LISTENING" in output:
        log("Servidor OmniVoice esta rodando!", "OK")
    else:
        log("Servidor NAO subiu apos 30s! Verifique os logs gradio_error.log.", "ERROR")

    # 7. Reiniciar tunnel
    tunnel_script = os.path.join(script_dir, "start_tunnel.ps1")
    if os.path.exists(tunnel_script):
        log("Reiniciando Tunnel...", "RESTART")
        subprocess.Popen(
            f'cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"',
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
            cwd=script_dir,
            stdout=open(os.path.join(script_dir, "tunnel.log"), "a"),
            stderr=open(os.path.join(script_dir, "tunnel_error.log"), "a"),
            shell=True,
        )
        time.sleep(15)

        code_cf, output_cf = run_cmd('tasklist | findstr /I "cloudflared"')
        code_nd, output_nd = run_cmd('tasklist | findstr /I "node"')
        if "cloudflared" in output_cf.lower() or "node" in output_nd.lower():
            tunnel_type = "Cloudflared" if "cloudflared" in output_cf.lower() else "Localtunnel (node)"
            log(f"Tunnel {tunnel_type} esta rodando!", "OK")
        else:
            log("Tunnel NAO subiu! Verifique se cloudflared ou node esta instalado.", "ERROR")
    else:
        log(f"Script start_tunnel.ps1 NAO encontrado: {tunnel_script}", "ERROR")

    log("========================================", "RESTART")
    log("RESTART COMPLETO!", "RESTART")
    return True

# ============================================
# LOOP PRINCIPAL
# ============================================

idle_since = None

def run_full_diagnostic() -> Dict:
    """Executa diagnostico completo e retorna resultados."""
    log("=" * 50)
    log(f"DIAGNOSTICO COMPLETO - {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log("=" * 50)

    results = {
        "timestamp": datetime.now().isoformat(),
        "checks": {},
    }

    results["checks"]["internet"] = check_internet_connection()
    results["checks"]["gpu"] = check_gpu()
    results["checks"]["python"] = check_python_environment()
    results["checks"]["gradio"] = check_gradio_server()
    results["checks"]["tunnel"] = check_tunnel()
    results["checks"]["disk"] = check_disk_space()
    results["checks"]["ram"] = check_ram()
    results["checks"]["temp_files"] = check_temp_files()
    results["checks"]["reference_audios"] = check_reference_audios()
    results["checks"]["future_issues"] = check_future_issues()

    log("-" * 50)
    log("RESUMO DO DIAGNOSTICO:")
    log("-" * 50)

    all_ok = True
    for name, check in results["checks"].items():
        if isinstance(check, dict):
            status = "OK" if check.get("ok", True) else "PROBLEMA"
            if not check.get("ok", True):
                all_ok = False
            if name != "future_issues":
                log(f"  {name}: {status}")
        elif isinstance(check, list):
            if check:
                log(f"  future_issues: {len(check)} alertas")
                all_ok = False
            else:
                log(f"  future_issues: Nenhum")

    if all_ok:
        log("TUDO OK! Sistema funcionando normalmente.", "OK")
    else:
        log("ALGUNS PROBLEMAS ENCONTRADOS! Veja os detalhes acima.", "WARN")

    log("=" * 50)

    return results

def monitor_loop():
    """Loop de monitoramento continuo com auto-restart."""
    global idle_since

    log("INICIANDO MONITORAMENTO CONTINUO", "RESTART")
    log(f"  Auto-restart: {'ATIVADO' if CONFIG['auto_restart_enabled'] else 'DESATIVADO'}")
    log(f"  Intervalo: {CONFIG['check_interval_seconds']}s | Idle para restart: {CONFIG['idle_minutes_before_restart']}min")
    log(f"  Max restarts/dia: {CONFIG['max_restarts_per_day']}")
    log(f"  Porta Gradio: {CONFIG['gradio_port']}")
    log(f"  Tunnel: cloudflared ou localtunnel via start_tunnel.ps1")
    log("")

    while True:
        try:
            results = run_full_diagnostic()

            if CONFIG["auto_restart_enabled"]:
                queue = check_queue_status()
                if queue["active"]:
                    log(f"Fila ativa: {queue['queue_count']} na fila, processando: {queue['processing']}")
                    idle_since = None
                else:
                    if idle_since is None:
                        idle_since = datetime.now()
                        log("Sistema ocioso detectado. Iniciando contador de idle...")
                    else:
                        idle_minutes = (datetime.now() - idle_since).total_seconds() / 60
                        remaining = CONFIG["idle_minutes_before_restart"] - idle_minutes
                        if remaining > 0:
                            log(f"Ocioso ha {int(idle_minutes)}min. Restart em {int(remaining)}min...")
                        else:
                            log(f"Ocioso ha {int(idle_minutes)}min. EXECUTANDO RESTART!")
                            do_restart()
                            idle_since = None

            time.sleep(CONFIG["check_interval_seconds"])

        except KeyboardInterrupt:
            log("Monitoramento interrompido pelo usuario.")
            break
        except Exception as e:
            log(f"Erro no loop de monitoramento: {e}", "ERROR")
            time.sleep(CONFIG["check_interval_seconds"])

# ============================================
# MAIN
# ============================================

def main():
    print("""
+----------------------------------------------+
|   VozPro - DIAGNOSTICO + AUTO-RESTART        |
|   Servidor Local GPU (Windows)               |
|   OmniVoice GPU + Tunnel (Cloudflare/Local)  |
+----------------------------------------------+
    """)

    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ["--diag", "-d", "diag"]:
            run_full_diagnostic()
            return
        elif arg in ["--restart", "-r", "restart"]:
            do_restart()
            return
        elif arg in ["--help", "-h", "help"]:
            print("""
USO:
  python diagnostico_auto_restart.py          Diagnostico + monitoramento (com auto-restart)
  python diagnostico_auto_restart.py --diag   So diagnostico (sem loop)
  python diagnostico_auto_restart.py --restart  Forcar restart agora

CONFIGURACAO:
  Edite o dicionario CONFIG no topo do script.

SEU SETUP:
  - Servidor: omnivoice_gpu.py (porta 7860)
  - Tunnel: cloudflared ou localtunnel via start_tunnel.ps1
  - Registro: sorteiomax.com.br/omnivoice/update_tunnel.php

SCRIPTS:
  iniciar.bat          - Inicia tudo (OmniVoice + Tunnel)
  start_tunnel.ps1     - So o tunnel
  omnivoice_gpu.py     - So o servidor OmniVoice
""")
            return
        elif arg in ["--monitor", "-m", "monitor"]:
            run_full_diagnostic()
            monitor_loop()
            return
    else:
        run_full_diagnostic()
        print("\n" + "=" * 50)
        print("Deseja iniciar o MONITORAMENTO CONTINUO?")
        print("  [S] Sim - monitorar e auto-restart quando ocioso")
        print("  [N] Nao - sair apos diagnostico")
        print("=" * 50)
        try:
            choice = input("\nOpcao (S/N): ").strip().upper()
            if choice == "S":
                run_full_diagnostic()
                monitor_loop()
            else:
                log("Saindo. Execute com --monitor para iniciar monitoramento.")
        except (KeyboardInterrupt, EOFError):
            log("Saindo...")

if __name__ == "__main__":
    main()
