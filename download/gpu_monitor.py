"""
GPU Monitor — Servidor leve que expoe estatisticas da GPU via HTTP.

Uso:
  python gpu_monitor.py

Porta padrao: 7861
Endpoint: http://localhost:7861/stats

Adicione esta porta ao cloudflared tunnel:
  - Abra o config do cloudflared (usualmente ~/.cloudflared/config.yml)
  - Adicione 7861 na lista de ports
  - Reinicie o cloudflared
"""

import json
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 7861


def get_gpu_stats():
    """Le nvidia-smi e retorna dicionario com stats da GPU."""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.limit', '--format=csv,noheader,nounits'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return {'error': 'nvidia-smi falhou', 'detail': result.stderr.strip()}

        # Parse: "NVIDIA GeForce RTX 3060, 9728, 12288, 44, 56, 125.0, 170.0"
        parts = [p.strip() for p in result.stdout.strip().split(',')]
        if len(parts) < 7:
            return {'error': 'nvidia-smi formato inesperado', 'raw': result.stdout.strip()}

        mem_used = int(parts[1])
        mem_total = int(parts[2])
        gpu_util = int(parts[3])
        temp = int(parts[4])
        power_draw = float(parts[5])
        power_limit = float(parts[6])

        return {
            'name': parts[0],
            'memory_used_mb': mem_used,
            'memory_total_mb': mem_total,
            'memory_percent': round(mem_used / mem_total * 100, 1),
            'gpu_utilization_percent': gpu_util,
            'temperature_celsius': temp,
            'power_draw_watts': power_draw,
            'power_limit_watts': power_limit,
            'status': 'ok'
        }
    except FileNotFoundError:
        return {'error': 'nvidia-smi nao encontrado', 'status': 'no_gpu'}
    except subprocess.TimeoutExpired:
        return {'error': 'nvidia-smi timeout', 'status': 'timeout'}
    except Exception as e:
        return {'error': str(e), 'status': 'error'}


class GPUHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/stats' or self.path == '/':
            stats = get_gpu_stats()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(stats).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silenciar logs de cada request
        pass


if __name__ == '__main__':
    print(f'GPU Monitor rodando na porta {PORT}')
    print(f'Acesse: http://localhost:{PORT}/stats')
    print('')
    stats = get_gpu_stats()
    if stats.get('status') == 'ok':
        print(f'GPU: {stats["name"]}')
        print(f'VRAM: {stats["memory_used_mb"]}/{stats["memory_total_mb"]} MB ({stats["memory_percent"]}%)')
        print(f'Uso: {stats["gpu_utilization_percent"]}% | Temp: {stats["temperature_celsius"]}C')
    else:
        print(f'AVISO: {stats.get("error", "GPU nao detectada")}')
    print('')
    print('Adicione esta porta ao cloudflared tunnel!')
    print('Pressione Ctrl+C para parar.')
    try:
        server = HTTPServer(('0.0.0.0', PORT), GPUHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nGPU Monitor encerrado.')
