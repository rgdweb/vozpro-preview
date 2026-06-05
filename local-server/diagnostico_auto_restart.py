"""
==========================================================
  VozPro - DIAGNÓSTICO COMPLETO + AUTO-RESTART
  Script para rodar no servidor local GPU (Windows)
==========================================================

VERIFICA:
  1. GPU NVIDIA (VRAM, temperatura, uso, drivers)
  2. Modelo OmniVoice carregado na memória
  3. Servidor Gradio rodando (porta 7860)
  4. Tunnel Cloudflared ativo e respondendo
  5. Áudios de referência (integridade, tamanho)
  6. Disco livre (C: e pasta temp)
  7. Memória RAM disponível
  8. Processos Python/Cloudflared rodando
  9. Conexão com internet
 10. Problemas futuros possíveis

AUTO-RESTART:
  - Monitora fila de geração (via API Vercel)
  - Quando fila está vazia E ninguém está gerando há X minutos
  - Limpa arquivos temporários
  - Reinicia o servidor Gradio E o tunnel
  - Log de tudo em diagnostico.log

COMO USAR:
  python diagnostico_auto_restart.py

CONFIGURAÇÃO:
  Edite as variáveis CONFIG abaixo conforme seu setup.
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

# PID do proprio processo (para nao se matar no restart)
MY_PID = os.getpid()

# No Windows, subprocess.STARTUPINFO para esconder janelas
def _get_hidden_startupinfo():
    """Retorna STARTUPINFO para esconder janela no Windows."""
    if sys.platform == 'win32':
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0  # SW_HIDE
        return si
    return None

# ============================================
# CONFIGURAÇÃO - Edite conforme necessário
# ============================================
CONFIG = {
    # Servidor Gradio (VozPro)
    "gradio_port": 7860,
    "gradio_host": "127.0.0.1",

    # Auto-restart
    "auto_restart_enabled": True,          # Ativar auto-restart?
    "idle_minutes_before_restart": 60,     # Minutos ocioso antes de restart (min 15)
    "check_interval_seconds": 120,         # Checar a cada X segundos (min 60)
    "max_restarts_per_day": 5,             # Máximo de restarts por dia

    # Cleanup de temp
    "cleanup_enabled": True,               # Limpar arquivos temp?
    "temp_max_age_hours": 2,               # Idade máxima de arquivos temp (horas)
    "cleanup_paths": [
        os.environ.get("TEMP", "C:/Temp"),
        os.environ.get("TMP", "C:/Windows/Temp"),
    ],

    # API Vercel (para checar fila)
    "vercel_api_url": "https://omnivoice-umber.vercel.app",
    "vercel_health_endpoint": "/api/health",
    "vercel_queue_endpoint": "/api/queue/join",

    # Alertas
    "gpu_temp_warning": 80,               # °C - alerta temperatura GPU
    "gpu_vram_warning": 90,               # % - alerta uso VRAM
    "disk_warning_gb": 5,                 # GB - alerta disco livre
    "ram_warning_percent": 90,            # % - alerta uso RAM

    # Log
    "log_file": "diagnostico.log",
    "max_log_lines": 5000,                # Rotação de log
}

# ============================================
# UTILITÁRIOS
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
            # Rotacionar log se muito grande
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
    """Verifica se há conexão com internet."""
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
# CHECAGENS DE DIAGNÓSTICO
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
        log("nvidia-smi NÃO disponível - GPU não encontrada ou drivers não instalados!", "ERROR")
        # Tentar detectar se é problema de drivers
        code2, output2 = run_cmd("nvidia-smi", 5)
        if code2 != 0:
            log("Comando nvidia-smi falhou completamente. Possíveis causas:", "ERROR")
            log("  1. Placa NVIDIA não instalada", "ERROR")
            log("  2. Drivers NVIDIA desatualizados ou corrompidos", "ERROR")
            log("  3. CUDA toolkit não instalado", "ERROR")
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

    # Verificar versão CUDA
    code, cuda_out = run_cmd("nvcc --version 2>&1 || nvidia-smi | findstr CUDA", 5)
    if "CUDA Version" in cuda_out or "release" in cuda_out.lower():
        result["cuda_version"] = cuda_out.strip()[:100]

    # Logs de status
    log(f"  GPU: {result['name']}", "OK")
    log(f"  VRAM: {result['vram_used_mb']}/{result['vram_total_mb']} MB ({result['vram_percent']}%)")
    log(f"  Livre: {result['vram_free_mb']} MB | Temp: {result['temperature']}°C | Uso: {result['gpu_usage']}%")
    log(f"  Driver: {result['driver_version']} | CUDA: {result['cuda_version'] or 'N/A'}")

    # Alertas
    if result["temperature"] and result["temperature"] >= CONFIG["gpu_temp_warning"]:
        log(f"ATENÇÃO: GPU a {result['temperature']}°C! Risco de throttle/desempenho reduzido!", "WARN")
    if result["vram_percent"] >= CONFIG["gpu_vram_warning"]:
        log(f"ATENÇÃO: VRAM a {result['vram_percent']}%! Pode causar OOM (Out of Memory)!", "WARN")
    if result["vram_free_mb"] < 1500:
        log(f"ATENÇÃO: Menos de 1.5GB de VRAM livre! Geração pode falhar!", "WARN")

    return result

def check_gradio_server() -> Dict:
    """Verifica se o servidor Gradio está rodando."""
    log("Verificando servidor Gradio...")
    result = {
        "ok": False,
        "running": False,
        "url": f"http://{CONFIG['gradio_host']}:{CONFIG['gradio_port']}",
        "pid": None,
        "response_time_ms": None,
        "model_loaded": False,
    }

    # Verificar processo
    code, output = run_cmd('netstat -ano | findstr ":7860"')
    if "LISTENING" in output:
        result["running"] = True
        # Tentar pegar PID
        try:
            line = [l for l in output.splitlines() if "LISTENING" in l][0]
            result["pid"] = line.strip().split()[-1]
        except (IndexError, ValueError):
            pass

    # Testar resposta HTTP
    if result["running"]:
        start_time = time.time()
        status, body = http_get(result["url"], 10)
        elapsed_ms = int((time.time() - start_time) * 1000)
        result["response_time_ms"] = elapsed_ms

        if status == 200:
            result["ok"] = True
            # Verificar se o modelo está carregado (título da página Gradio)
            if "VozPro" in body or "gradio" in body.lower():
                result["model_loaded"] = True
            log(f"  Servidor OK | PID: {result['pid']} | Resposta: {elapsed_ms}ms", "OK")
        else:
            log(f"  Servidor respondendo mas com status {status}!", "WARN")
    else:
        log("  Servidor NÃO está rodando na porta 7860!", "ERROR")
        log("  Para iniciar: python omnivoice_server.py", "ERROR")

    return result

def check_tunnel() -> Dict:
    """Verifica status do Cloudflared Tunnel."""
    log("Verificando Cloudflared Tunnel...")
    result = {
        "ok": False,
        "process_running": False,
        "pid": None,
        "tunnel_url": None,
        "reachable_from_internet": False,
    }

    # Verificar processo cloudflared
    code, output = run_cmd('tasklist | findstr /I "cloudflared"')
    if "cloudflared" in output.lower():
        result["process_running"] = True
        log("  Processo cloudflared rodando", "OK")
    else:
        log("  Cloudflared NÃO está rodando!", "ERROR")
        log("  Para iniciar: cloudflared tunnel --url http://localhost:7860", "ERROR")
        return result

    # Tentar pegar PID
    try:
        for line in output.splitlines():
            if "cloudflared" in line.lower():
                parts = line.strip().split()
                if len(parts) >= 2:
                    result["pid"] = parts[1]
                    break
    except (IndexError, ValueError):
        pass

    # Verificar se o tunnel está acessível via internet
    # Tenta acessar o endpoint de saúde da Vercel
    status, body = http_get(CONFIG["vercel_api_url"] + CONFIG["vercel_health_endpoint"], 15)
    if status == 200:
        result["reachable_from_internet"] = True
        result["ok"] = True
        log("  Tunnel acessível via Vercel (endpoint /api/health OK)", "OK")
    else:
        log(f"  Vercel /api/health retornou status {status}", "WARN")
        log("  O tunnel pode estar caído ou Vercel offline", "WARN")

    return result

def check_disk_space() -> Dict:
    """Verifica espaço em disco."""
    log("Verificando disco...")
    result = {"ok": True, "drives": {}}

    # Verificar discos principais
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
                    log(f"  ATENÇÃO: {drive} com menos de {CONFIG['disk_warning_gb']}GB livres!", "WARN")
                    result["ok"] = False
            except Exception as e:
                log(f"  Erro ao verificar {drive}: {e}", "ERROR")
                result["ok"] = False

    return result

def check_ram() -> Dict:
    """Verifica uso de memória RAM."""
    log("Verificando RAM...")
    result = {"ok": True, "total_gb": 0, "available_gb": 0, "used_percent": 0}

    code, output = run_cmd(
        'wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /Value 2>nul',
        timeout=10
    )

    try:
        lines = [l.strip() for l in output.strip().splitlines() if "=" in l]
        mem_info = {}
        for line in lines:
            key, val = line.split("=", 1)
            mem_info[key.strip()] = int(val.strip())

        total_kb = mem_info.get("TotalVisibleMemorySize", 0)
        free_kb = mem_info.get("FreePhysicalMemory", 0)
        used_kb = total_kb - free_kb

        result["total_gb"] = round(total_kb / (1024**2), 2)
        result["available_gb"] = round(free_kb / (1024**2), 2)
        result["used_percent"] = round((used_kb / total_kb) * 100, 1) if total_kb > 0 else 0

        log(f"  Total: {result['total_gb']} GB | Disponível: {result['available_gb']} GB ({result['used_percent']}% usado)")

        if result["used_percent"] >= CONFIG["ram_warning_percent"]:
            log(f"  ATENÇÃO: RAM a {result['used_percent']}%! Sistema pode ficar lento!", "WARN")
            result["ok"] = False
    except Exception as e:
        log(f"  Erro ao verificar RAM: {e}", "ERROR")
        result["ok"] = False

    return result

def check_reference_audios(base_path: Optional[str] = None) -> Dict:
    """Verifica integridade dos áudios de referência."""
    log("Verificando áudios de referência...")
    result = {"ok": True, "total": 0, "valid": 0, "invalid": [], "warnings": []}

    # Procurar áudios nas pastas comuns
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
            # Ignorar pastas de sistema
            dirs[:] = [d for d in dirs if d.lower() not in {"node_modules", ".git", "__pycache__", ".next"}]
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext in audio_extensions:
                    fpath = os.path.join(root, fname)
                    fsize = os.path.getsize(fpath)
                    result["total"] += 1

                    # Verificar tamanho (áudios de ref TTS devem ter 1-30MB)
                    if fsize < 1024:  # menor que 1KB
                        result["invalid"].append(f"{fname} ({fsize} bytes - muito pequeno!)")
                        result["ok"] = False
                    elif fsize > 50 * 1024 * 1024:  # maior que 50MB
                        result["warnings"].append(f"{fname} ({round(fsize/1024/1024, 1)}MB - muito grande, pode causar lentidão)")
                    else:
                        result["valid"] += 1

    log(f"  Total: {result['total']} áudios | Válidos: {result['valid']}")
    if result["invalid"]:
        log(f"  PROBLEMAS: {len(result['invalid'])} áudios inválidos!", "ERROR")
        for inv in result["invalid"]:
            log(f"    - {inv}", "ERROR")
    if result["warnings"]:
        for warn in result["warnings"]:
            log(f"  AVISO: {warn}", "WARN")

    return result

def check_temp_files() -> Dict:
    """Verifica e limpa arquivos temporários."""
    log("Verificando arquivos temporários...")
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

    log(f"  Arquivos antigos: {result['old_files']} | Limpos: {result['cleaned']} | Espaço liberado: {result['freed_mb']:.1f}MB")

    return result

def check_internet_connection() -> Dict:
    """Verifica conexão com internet."""
    log("Verificando internet...")
    result = {"ok": False, "latency_ms": None}

    start = time.time()
    if check_internet():
        result["ok"] = True
        result["latency_ms"] = int((time.time() - start) * 1000)
        log(f"  Internet OK (latência: {result['latency_ms']}ms)", "OK")
    else:
        log("  SEM conexão com internet! Tunnel não vai funcionar!", "ERROR")
        log("  Possíveis causas: WiFi desconectado, DNS, proxy, firewall", "ERROR")

    return result

def check_python_environment() -> Dict:
    """Verifica ambiente Python e dependências."""
    log("Verificando ambiente Python...")
    result = {"ok": True, "python_version": None, "torch_version": None, "omnivoice": False, "gradio": False}

    code, output = run_cmd("python --version 2>&1", 5)
    if code == 0:
        result["python_version"] = output.strip()
        log(f"  Python: {result['python_version']}", "OK")
    else:
        log("  Python NÃO encontrado!", "ERROR")
        result["ok"] = False
        return result

    code, output = run_cmd("python -c \"import torch; print(torch.__version__)\" 2>&1", 10)
    if code == 0:
        result["torch_version"] = output.strip()
        log(f"  PyTorch: {result['torch_version']}", "OK")
    else:
        log("  PyTorch NÃO encontrado!", "ERROR")
        result["ok"] = False

    code, output = run_cmd("python -c \"import omnivoice; print('OK')\" 2>&1", 10)
    result["omnivoice"] = code == 0
    if code == 0:
        log("  OmniVoice: instalado", "OK")
    else:
        log("  OmniVoice NÃO encontrado! pip install omnivoice", "ERROR")
        result["ok"] = False

    code, output = run_cmd("python -c \"import gradio; print(gradio.__version__)\" 2>&1", 10)
    result["gradio"] = code == 0
    if code == 0:
        log(f"  Gradio: {output.strip()}", "OK")
    else:
        log("  Gradio NÃO encontrado!", "ERROR")
        result["ok"] = False

    # Verificar CUDA no PyTorch
    code, output = run_cmd("python -c \"import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A')\" 2>&1", 10)
    if code == 0:
        cuda_status = output.strip()
        if "True" in cuda_status:
            log(f"  CUDA: disponível ({cuda_status.split(',')[1].strip() if ',' in cuda_status else 'GPU'})", "OK")
        else:
            log(f"  CUDA: NÃO disponível! ({cuda_status})", "ERROR")
            log("  A geração de áudio NÃO vai funcionar sem CUDA!", "ERROR")
            result["ok"] = False

    return result

def check_future_issues() -> List[str]:
    """Identifica possíveis problemas futuros."""
    log("Analisando riscos futuros...")
    issues = []

    # 1. Driver NVIDIA desatualizado
    code, output = run_cmd("nvidia-smi --query-gpu=driver_version --format=csv,noheader", 5)
    if code == 0:
        driver = output.strip()
        # Drivers muito antigos (< 500) podem ter problemas
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
                    issues.append(f"CRÍTICO: Disco {drive} quase cheio! {free_gb}GB livres!")
            except Exception:
                pass

    # 3. Arquivos temporários acumulando
    for temp_path in CONFIG["cleanup_paths"]:
        if temp_path and os.path.exists(temp_path):
            try:
                count = sum(1 for _ in Path(temp_path).rglob("*") if _.is_file())
                if count > 10000:
                    issues.append(f"Pasta temp {temp_path} com {count} arquivos! Pode causar lentidão.")
            except Exception:
                pass

    # 4. VRAM fragmentation
    code, output = run_cmd("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", 5)
    if code == 0:
        try:
            vram_used = int(float(output.strip()))
            # Se está usando muita VRAM sem estar gerando, pode ser leak
            if vram_used > 8000:
                issues.append(f"VRAM usando {vram_used}MB sem gerar ativamente. Possível memory leak - reinicie o servidor.")
        except ValueError:
            pass

    # 5. Processos Python zumbis
    code, output = run_cmd('tasklist | findstr /I "python"')
    python_count = output.lower().count("python")
    if python_count > 3:
        issues.append(f"{python_count} processos Python rodando! Pode haver processos zumbis. Reinicie.")

    # 6. Cloudflared desatualizado
    code, output = run_cmd("cloudflared --version 2>&1", 5)
    if code != 0:
        issues.append("Cloudflared não encontrado ou não está no PATH. Tunnel não vai funcionar.")

    # 7. Se o modelo não carregou
    # (será verificado no check_gradio_server)

    if issues:
        log(f"  {len(issues)} possíveis problemas identificados:")
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

def _kill_gradio_only():
    """Mata APENAS o servidor Gradio (python na porta 7860), sem matar este script.
    Antes fazia 'taskkill /F /IM python.exe' que matava TODOS os python incluindo o proprio
    monitoramento, causando acumulo de janelas CMD a cada restart."""
    log("Parando servidor Gradio (somente PID na porta 7860)...", "RESTART")

    # Encontrar PID escutando na porta do Gradio
    code, output = run_cmd(f'netstat -ano | findstr ":{CONFIG["gradio_port"]}"')
    killed_any = False
    for line in output.splitlines():
        if "LISTENING" in line:
            parts = line.strip().split()
            if parts:
                pid = parts[-1]
                if pid and int(pid) != MY_PID:
                    log(f"  Matando PID {pid} (porta {CONFIG['gradio_port']})")
                    run_cmd(f"taskkill /F /PID {pid}", 10)
                    killed_any = True
                elif int(pid) == MY_PID:
                    log(f"  Pulando PID {pid} (este script de monitoramento)")

    if not killed_any:
        log("  Nenhum processo encontrado na porta do Gradio (já estava parado?)", "WARN")

    return killed_any


def do_restart():
    """Executa o restart completo do servidor."""
    log("INICIANDO RESTART AUTOMÁTICO!", "RESTART")
    log("========================================", "RESTART")

    # Reset contador diário
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
    log("Limpando arquivos temporários...", "RESTART")
    check_temp_files()

    # 2. Matar cloudflared
    log("Parando Cloudflared...", "RESTART")
    run_cmd("taskkill /F /IM cloudflared.exe", 10)
    time.sleep(3)

    # 3. Matar APENAS o Gradio (NAO matar todos os python.exe!)
    _kill_gradio_only()
    time.sleep(3)

    # 4. Limpar cache PyTorch (se possível via subprocess)
    log("Aguardando liberação de recursos...", "RESTART")
    time.sleep(5)

    # 5. Reiniciar Gradio
    log("Reiniciando servidor Gradio...", "RESTART")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    server_script = os.path.join(script_dir, "omnivoice_gpu.py")

    startupinfo = _get_hidden_startupinfo()

    if os.path.exists(server_script):
        # Iniciar em background SEM abrir janela CMD
        subprocess.Popen(
            ["python", server_script],
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
            stdout=open(os.path.join(script_dir, "gradio.log"), "a"),
            stderr=open(os.path.join(script_dir, "gradio_error.log"), "a"),
            startupinfo=startupinfo,
        )
        log("Servidor Gradio iniciado em background", "RESTART")
    else:
        log(f"Script do servidor NÃO encontrado: {server_script}", "ERROR")
        log("O Gradio NÃO foi reiniciado automaticamente. Inicie manualmente.", "ERROR")

    # 6. Aguardar Gradio subir
    log("Aguardando servidor subir (30s)...", "RESTART")
    time.sleep(30)

    # Verificar se subiu
    code, output = run_cmd(f'netstat -ano | findstr ":{CONFIG["gradio_port"]}"')
    if "LISTENING" in output:
        log("Servidor Gradio está rodando!", "OK")
    else:
        log("Servidor Gradio NÃO subiu após 30s! Verifique os logs.", "ERROR")

    # 7. Reiniciar Cloudflared
    log("Reiniciando Cloudflared...", "RESTART")
    subprocess.Popen(
        ["cloudflared", "tunnel", "--url", f"http://localhost:{CONFIG['gradio_port']}"],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
        stdout=open(os.path.join(script_dir, "tunnel.log"), "a"),
        stderr=open(os.path.join(script_dir, "tunnel_error.log"), "a"),
        startupinfo=startupinfo,
    )
    time.sleep(10)

    code, output = run_cmd('tasklist | findstr /I "cloudflared"')
    if "cloudflared" in output.lower():
        log("Cloudflared está rodando!", "OK")
    else:
        log("Cloudflared NÃO subiu! Verifique a instalação.", "ERROR")

    log("========================================", "RESTART")
    log("RESTART COMPLETO!", "RESTART")
    return True

# ============================================
# LOOP PRINCIPAL
# ============================================

idle_since = None  # Quando começou o período ocioso

def run_full_diagnostic() -> Dict:
    """Executa diagnóstico completo e retorna resultados."""
    log("=" * 50)
    log(f"DIAGNÓSTICO COMPLETO - {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log("=" * 50)

    results = {
        "timestamp": datetime.now().isoformat(),
        "checks": {},
    }

    # Executar todas as verificações
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

    # Resumo
    log("-" * 50)
    log("RESUMO DO DIAGNÓSTICO:")
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
    """Loop de monitoramento contínuo com auto-restart."""
    global idle_since

    log("INICIANDO MONITORAMENTO CONTÍNUO", "RESTART")
    log(f"  Auto-restart: {'ATIVADO' if CONFIG['auto_restart_enabled'] else 'DESATIVADO'}")
    log(f"  Intervalo: {CONFIG['check_interval_seconds']}s | Idle para restart: {CONFIG['idle_minutes_before_restart']}min")
    log(f"  Max restarts/dia: {CONFIG['max_restarts_per_day']}")
    log("")

    while True:
        try:
            # Executar diagnóstico
            results = run_full_diagnostic()

            if CONFIG["auto_restart_enabled"]:
                # Verificar fila
                queue = check_queue_status()
                if queue["active"]:
                    log(f"Fila ativa: {queue['queue_count']} na fila, processando: {queue['processing']}")
                    idle_since = None  # Reset idle timer
                else:
                    if idle_since is None:
                        idle_since = datetime.now()
                        log("Sistema ocioso detectado. Iniciando contador de idle...")
                    else:
                        idle_minutes = (datetime.now() - idle_since).total_seconds() / 60
                        remaining = CONFIG["idle_minutes_before_restart"] - idle_minutes
                        if remaining > 0:
                            log(f"Ocioso há {int(idle_minutes)}min. Restart em {int(remaining)}min...")
                        else:
                            log(f"Ocioso há {int(idle_minutes)}min. EXECUTANDO RESTART!")
                            do_restart()
                            idle_since = None  # Reset após restart

            # Aguardar próximo ciclo
            time.sleep(CONFIG["check_interval_seconds"])

        except KeyboardInterrupt:
            log("Monitoramento interrompido pelo usuário.")
            break
        except Exception as e:
            log(f"Erro no loop de monitoramento: {e}", "ERROR")
            time.sleep(CONFIG["check_interval_seconds"])

# ============================================
# MAIN
# ============================================

def main():
    print("""
╔══════════════════════════════════════════════╗
║     VozPro - DIAGNÓSTICO + AUTO-RESTART      ║
║     Servidor Local GPU (Windows)              ║
╚══════════════════════════════════════════════╝
    """)

    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ["--diag", "-d", "diag"]:
            # Só diagnóstico, sem loop
            run_full_diagnostic()
            return
        elif arg in ["--restart", "-r", "restart"]:
            # Forçar restart
            do_restart()
            return
        elif arg in ["--help", "-h", "help"]:
            print("""
USO:
  python diagnostico_auto_restart.py          Monitoramento contínuo (com auto-restart)
  python diagnostico_auto_restart.py --diag   Só diagnóstico (sem loop)
  python diagnostico_auto_restart.py --restart  Forçar restart agora

CONFIGURAÇÃO:
  Edite o dicionário CONFIG no topo do script.
""")
            return
        elif arg in ["--monitor", "-m", "monitor"]:
            # Monitoramento contínuo
            run_full_diagnostic()
            monitor_loop()
            return
    else:
        # Default: diagnóstico + monitoramento
        run_full_diagnostic()
        print("\n" + "=" * 50)
        print("Deseja iniciar o MONITORAMENTO CONTÍNUO?")
        print("  [S] Sim - monitorar e auto-restart quando ocioso")
        print("  [N] Não - sair após diagnóstico")
        print("=" * 50)
        try:
            choice = input("\nOpção (S/N): ").strip().upper()
            if choice == "S":
                run_full_diagnostic()
                monitor_loop()
            else:
                log("Saindo. Execute com --monitor para iniciar monitoramento.")
        except (KeyboardInterrupt, EOFError):
            log("Saindo...")

if __name__ == "__main__":
    main()
