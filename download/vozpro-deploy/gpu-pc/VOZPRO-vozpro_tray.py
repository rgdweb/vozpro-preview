#!/usr/bin/env python3
"""
VozPro - System Tray Application
================================
Roda OmniVoice + Tunnel em segundo plano (sem janelas visiveis).
Icone na bandeja do sistema (perto do relogio).

REQUISITOS:
  pip install pystray Pillow

COMO USAR:
  1. Coloque este arquivo na mesma pasta do omnivoice_gpu.py
  2. Execute: pythonw vozpro_tray.py
  3. Ou use o VozPro_Tray.vbs para iniciar silenciosamente

INSTALAR AUTO-INICIO:
  Clique com botao direito no icone > "Auto-inicio com Windows"
"""

import subprocess
import sys
import os
import time
import threading
import json
import urllib.request
import urllib.error
from pathlib import Path

# ============================================================
# CONFIGURACAO
# ============================================================

WORK_DIR = os.path.dirname(os.path.abspath(__file__))
GRADIO_PORT = 7860
CONDA_ACTIVATE = r"C:\Users\Administrador\Miniconda3\Scripts\activate.bat"
TUNNEL_CHECK_URL = "http://147.15.77.137/get_tunnel.php"
TUNNEL_AUTH = "vozpro_tunnel_2024"
LOG_FILE = os.path.join(WORK_DIR, "vozpro_tray.log")

# Cores do icone
GREEN = (0, 180, 80)
YELLOW = (220, 180, 0)
RED = (220, 50, 50)
GRAY = (120, 120, 120)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# ============================================================
# LOG (salva em arquivo, nao trava o app)
# ============================================================

def log(msg):
    try:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {msg}"
        print(line)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass

# ============================================================
# PROCESSO MANAGER
# ============================================================

class ProcessManager:
    def __init__(self):
        self.gpu = None
        self.tunnel = None
        self.gpu_running = False
        self.tunnel_running = False
        self.tunnel_url = ""
        self._lock = threading.Lock()

    def _make_startupinfo(self):
        """Cria STARTUPINFO para esconder janelas"""
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0  # SW_HIDE
        return si

    def start_gpu(self):
        """Inicia OmniVoice GPU em segundo plano"""
        if self.gpu and self.gpu.poll() is None:
            log("[GPU] Ja esta rodando")
            return

        log("[GPU] Iniciando OmniVoice...")
        cmd = (
            f'cmd /c ""{CONDA_ACTIVATE}" && '
            f'set CUDA_VISIBLE_DEVICES=0 && '
            f'set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && '
            f'python omnivoice_gpu.py --ip 0.0.0.0 --port {GRADIO_PORT}""'
        )
        try:
            self.gpu = subprocess.Popen(
                cmd,
                shell=True,
                cwd=WORK_DIR,
                startupinfo=self._make_startupinfo(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.gpu_running = True
            log(f"[GPU] Processo iniciado (PID: {self.gpu.pid})")
        except Exception as e:
            log(f"[GPU] ERRO ao iniciar: {e}")
            self.gpu_running = False

    def stop_gpu(self):
        """Para OmniVoice GPU"""
        if self.gpu and self.gpu.poll() is None:
            try:
                self.gpu.terminate()
                self.gpu.wait(timeout=10)
            except:
                try:
                    self.gpu.kill()
                except:
                    pass
            log(f"[GPU] Parado")
        self.gpu = None
        self.gpu_running = False

    def start_tunnel(self):
        """Inicia tunnel em segundo plano"""
        if self.tunnel and self.tunnel.poll() is None:
            log("[TUNNEL] Ja esta rodando")
            return

        # Verificar se GPU esta pronta
        if not self._check_gpu_health():
            log("[TUNNEL] GPU nao esta pronta, aguardando...")
            return

        log("[TUNNEL] Iniciando localtunnel...")
        cmd = f'powershell -ExecutionPolicy Bypass -File "{WORK_DIR}\\start_tunnel.ps1"'
        try:
            self.tunnel = subprocess.Popen(
                cmd,
                shell=True,
                cwd=WORK_DIR,
                startupinfo=self._make_startupinfo(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.tunnel_running = True
            log(f"[TUNNEL] Processo iniciado (PID: {self.tunnel.pid})")
        except Exception as e:
            log(f"[TUNNEL] ERRO ao iniciar: {e}")
            self.tunnel_running = False

    def stop_tunnel(self):
        """Para tunnel"""
        if self.tunnel and self.tunnel.poll() is None:
            try:
                self.tunnel.terminate()
                self.tunnel.wait(timeout=10)
            except:
                try:
                    self.tunnel.kill()
                except:
                    pass
            log("[TUNNEL] Parado")
        self.tunnel = None
        self.tunnel_running = False

    def check_tunnel_registration(self):
        """Verifica se o tunnel esta registrado no Oracle"""
        try:
            req = urllib.request.Request(
                f"{TUNNEL_CHECK_URL}?auth={TUNNEL_AUTH}",
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
                url = data.get("tunnelUrl", "")
                if url:
                    self.tunnel_url = url
                    self.tunnel_running = True
                    return True
        except:
            pass
        return False

    def _check_gpu_health(self):
        """Verifica se GPU esta respondendo"""
        try:
            urllib.request.urlopen(f"http://localhost:{GRADIO_PORT}/", timeout=3)
            return True
        except:
            return False

    def check_gpu_health(self):
        """Verifica se GPU esta respondendo (publico)"""
        ok = self._check_gpu_health()
        if ok:
            self.gpu_running = True
        return ok

    def check_all(self):
        """Verifica estado de todos os servicos e reinicia se necessario"""
        changed = False

        # GPU
        if self.gpu and self.gpu.poll() is not None:
            log("[MONITOR] GPU caiu! Reiniciando...")
            self.gpu_running = False
            self.start_gpu()
            changed = True
        elif self.gpu and not self._check_gpu_health():
            # Processo vivo mas nao respondendo - matar e reiniciar
            log("[MONITOR] GPU nao responde! Reiniciando...")
            self.stop_gpu()
            self.start_gpu()
            changed = True

        # Tunnel
        if self.tunnel and self.tunnel.poll() is not None:
            log("[MONITOR] Tunnel caiu! Reiniciando...")
            self.tunnel_running = False
            self.tunnel_url = ""
            time.sleep(3)
            self.start_tunnel()
            changed = True
        elif self.tunnel_running and not self.check_tunnel_registration():
            # Processo vivo mas URL nao registrada
            if time.time() - getattr(self, '_last_tunnel_check', 0) > 60:
                self._last_tunnel_check = time.time()
                log("[MONITOR] Tunnel sem URL registrada")

        return changed

    def stop_all(self):
        """Para todos os servicos"""
        self.stop_tunnel()
        self.stop_gpu()
        log("[TRAY] Todos os servicos parados")

    def get_status_text(self):
        """Retorna texto de status resumido"""
        gpu = "ON" if self.gpu_running else "OFF"
        tun = "ON" if self.tunnel_running else "OFF"
        return f"GPU:{gpu} | Tunnel:{tun}"


# ============================================================
# ICONE
# ============================================================

def create_icon_image(color=GREEN):
    """Cria um icone circular com a cor especificada"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "pystray"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        from PIL import Image, ImageDraw

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Circulo externo
    draw.ellipse([2, 2, size - 2, size - 2], fill=color)
    # Brilho interno
    draw.ellipse([8, 8, size - 8, size - 8], fill=tuple(min(255, c + 40) for c in color))
    # Letra V
    try:
        draw.text([18, 12], "VP", fill=WHITE)
    except:
        pass

    return img


# ============================================================
# MENU DINAMICO
# ============================================================

def make_menu(pm: ProcessManager, tray_icon, do_install_autostart, do_open_browser):
    """Cria menu com status atualizado"""

    gpu_status = "✓ Rodando" if pm.gpu_running else "✗ Parado"
    gpu_color = GREEN if pm.gpu_running else RED

    tunnel_status = "✓ Online" if pm.tunnel_running else "✗ Parado"
    tunnel_color = GREEN if pm.tunnel_running else RED

    tunnel_info = f"Tunnel: {tunnel_status}"
    if pm.tunnel_url:
        tunnel_info += f"\n    {pm.tunnel_url}"

    return pystray.Menu(
        pystray.MenuItem("Iniciar Tudo", lambda: threading.Thread(target=start_all_thread, args=(pm, tray_icon), daemon=True).start()),
        pystray.MenuItem("Parar Tudo", lambda: stop_all(pm, tray_icon)),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(f"GPU: {gpu_status}", None, enabled=False),
        pystray.MenuItem(f"Tunnel: {tunnel_status}", None, enabled=False),
        pystray.MenuItem(f"Monitor: ✓ Rodando", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Abrir no Navegador", lambda: do_open_browser()),
        pystray.MenuItem("Auto-inicio com Windows", lambda: do_install_autostart(tray_icon)),
        pystray.MenuItem("Abrir Pasta de Trabalho", lambda: os.startfile(WORK_DIR)),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Sair", lambda: exit_app(pm, tray_icon)),
    )


# ============================================================
# ACOES
# ============================================================

def start_all_thread(pm: ProcessManager, icon):
    """Thread para iniciar tudo em sequencia"""
    log("[TRAY] Iniciando todos os servicos...")

    # 1. GPU
    pm.start_gpu()
    log("[TRAY] Aguardando GPU ficar pronta...")
    for i in range(60):  # 5 minutos
        time.sleep(5)
        if pm.check_gpu_health():
            log("[TRAY] GPU pronta!")
            break
        if i % 6 == 5:
            log(f"[TRAY] Aguardando GPU... ({(i+1)*5}s)")

    # 2. Tunnel
    pm.start_tunnel()
    log("[TRAY] Aguardando tunnel registrar URL...")
    for i in range(30):  # 90 segundos
        time.sleep(3)
        if pm.check_tunnel_registration():
            log(f"[TRAY] Tunnel online: {pm.tunnel_url}")
            break
        if i % 5 == 4:
            log(f"[TRAY] Aguardando tunnel... ({(i+1)*3}s)")

    # 3. Atualizar icone e tooltip
    update_tray_icon(icon, pm)


def stop_all(pm: ProcessManager, icon):
    pm.stop_all()
    update_tray_icon(icon, pm)


def update_tray_icon(icon, pm: ProcessManager):
    """Atualiza icone e tooltip com base no status"""
    if pm.gpu_running and pm.tunnel_running:
        icon.icon = create_icon_image(GREEN)
        icon.title = f"VozPro - Online | {pm.tunnel_url}"
    elif pm.gpu_running or pm.tunnel_running:
        icon.icon = create_icon_image(YELLOW)
        icon.title = "VozPro - Iniciando..."
    else:
        icon.icon = create_icon_image(RED)
        icon.title = "VozPro - Offline"


def exit_app(pm: ProcessManager, icon):
    log("[TRAY] Saindo...")
    pm.stop_all()
    icon.stop()


def install_autostart(icon):
    """Cria atalho na pasta Startup do Windows"""
    try:
        startup_folder = os.path.join(
            os.environ["APPDATA"],
            r"Microsoft\Windows\Start Menu\Programs\Startup"
        )

        # Criar VBS que inicia o tray silenciosamente
        vbs_path = os.path.join(WORK_DIR, "VozPro_Tray.vbs")
        vbs_content = f'''Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "{WORK_DIR}"
WshShell.Run "pythonw.exe vozpro_tray.py", 0, False
'''
        with open(vbs_path, "w", encoding="utf-8") as f:
            f.write(vbs_content)

        # Criar atalho no Startup
        import win32com.client
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortCut(os.path.join(startup_folder, "VozPro.lnk"))
        shortcut.TargetPath = vbs_path
        shortcut.WorkingDirectory = WORK_DIR
        shortcut.Description = "VozPro - System Tray"
        shortcut.save()

        icon.notify("Auto-inicio ativado! VozPro vai iniciar com o Windows.", "VozPro")
        log("[TRAY] Auto-inicio ativado")
    except ImportError:
        # Tentar via PowerShell se pywin32 nao estiver instalado
        try:
            startup_folder = os.path.join(
                os.environ["APPDATA"],
                r"Microsoft\Windows\Start Menu\Programs\Startup"
            )
            vbs_path = os.path.join(WORK_DIR, "VozPro_Tray.vbs")
            vbs_content = f'''Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "{WORK_DIR}"
WshShell.Run "pythonw.exe vozpro_tray.py", 0, False
'''
            with open(vbs_path, "w", encoding="utf-8") as f:
                f.write(vbs_content)

            ps_cmd = (
                f'$ws = New-Object -ComObject WScript.Shell; '
                f'$s = $ws.CreateShortcut("{os.path.join(startup_folder, "VozPro.lnk")}"); '
                f'$s.TargetPath = "{vbs_path}"; '
                f'$s.WorkingDirectory = "{WORK_DIR}"; '
                f'$s.Save()'
            )
            subprocess.run(
                ["powershell", "-Command", ps_cmd],
                capture_output=True, timeout=15
            )
            icon.notify("Auto-inicio ativado!", "VozPro")
            log("[TRAY] Auto-inicio ativado (via PowerShell)")
        except Exception as e:
            log(f"[TRAY] Erro ao ativar auto-inicio: {e}")
            icon.notify(f"Erro: {e}", "VozPro")
    except Exception as e:
        log(f"[TRAY] Erro ao ativar auto-inicio: {e}")
        icon.notify(f"Erro: {e}", "VozPro")


def open_browser():
    import webbrowser
    webbrowser.open("https://omnivoice-umber.vercel.app/")


# ============================================================
# MONITOR LOOP (roda em thread separada)
# ============================================================

def monitor_loop(pm: ProcessManager, icon, stop_event):
    """Loop principal de monitoramento"""
    log("[MONITOR] Iniciando monitoramento...")

    # Esperar inicializacao completa
    time.sleep(15)

    while not stop_event.is_set():
        try:
            pm.check_all()
            update_tray_icon(icon, pm)
        except Exception as e:
            log(f"[MONITOR] Erro: {e}")

        # Esperar 30 segundos antes da proxima checagem
        for _ in range(30):
            if stop_event.is_set():
                break
            time.sleep(1)


# ============================================================
# MAIN
# ============================================================

def main():
    log("=" * 50)
    log("VozPro System Tray - Iniciando")
    log("=" * 50)

    # Instalar dependencias se necessario
    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError:
        log("[SETUP] Instalando dependencias (pystray, Pillow)...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pystray", "Pillow"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        import pystray
        from PIL import Image, ImageDraw

    pm = ProcessManager()
    stop_event = threading.Event()

    # Criar icone
    icon = pystray.Icon(
        name="VozPro",
        icon=create_icon_image(GRAY),
        title="VozPro - Iniciando...",
        hover_text="VozPro",
        menu=make_menu(pm, None, install_autostart, open_browser),
    )

    # Atualizar menu quando clicar (recria com status atual)
    def on_clicked(icon, item):
        """Atualiza o menu toda vez que clicar"""
        icon.menu = make_menu(pm, icon, install_autostart, open_browser)

    # Referencia ao icon para o menu
    def refresh_menu():
        icon.menu = make_menu(pm, icon, lambda i=icon: install_autostart(i), open_browser)

    # Iniciar monitor em thread separada
    monitor_thread = threading.Thread(
        target=monitor_loop,
        args=(pm, icon, stop_event),
        daemon=True,
    )
    monitor_thread.start()

    # Iniciar servicos em thread separada
    start_thread = threading.Thread(
        target=start_all_thread,
        args=(pm, icon),
        daemon=True,
    )
    start_thread.start()

    # Atualizar menu periodicamente
    def menu_updater():
        while not stop_event.is_set():
            try:
                icon.menu = make_menu(pm, icon, lambda i=icon: install_autostart(i), open_browser)
            except:
                pass
            for _ in range(15):
                if stop_event.is_set():
                    break
                time.sleep(1)

    threading.Thread(target=menu_updater, daemon=True).start()

    log("[TRAY] App iniciado! Icone na bandeja do sistema.")

    try:
        icon.run()
    except:
        pass
    finally:
        stop_event.set()
        pm.stop_all()
        log("[TRAY] App encerrado.")


if __name__ == "__main__":
    main()
