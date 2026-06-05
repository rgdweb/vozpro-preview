"""
VozPro Server - TTS via VozPro (k2-fsa)
Rodar na GPU local com cloudflared tunnel para Vercel.

INSTALAÇÃO:
1. pip install omnivoice
2. python omnivoice_server.py

O servidor sobe na porta 7861 e usa o Gradio nativo do VozPro.
Vercel se conecta via tunnel (cloudflared) ou URL direta.

Features:
- Voice Cloning (ref_audio + ref_text opcional)
- Voice Design (só instruct, sem áudio de referência)
- Auto Voice (sem nada, modelo escolhe)
- Pronúncia CMU via colchetes [B EY1 S]
- Non-verbal symbols [laughter], [sigh], etc
- RTF 0.025 (40x mais rápido que tempo real)
"""

import argparse
import json
import os
import tempfile
import time
import numpy as np
import soundfile as sf

from omnivoice import OmniVoice
import torch

# LIMITAR GPU a 85% (deixa ~1.8GB livre numa RTX 3060 12GB)
torch.cuda.set_per_process_memory_fraction(0.85)
# Limpar cache residual da PyTorch ao iniciar
torch.cuda.empty_cache()
import gradio as gr

# ============================================
# MODELO GLOBAL (carregado uma vez)
# ============================================
model = None
SAMPLE_RATE = 24000


def load_model():
    """Carrega o modelo VozPro na GPU."""
    global model
    if model is not None:
        return model

    print("[VozPro] Carregando modelo k2-fsa/OmniVoice na GPU...")
    start = time.time()

    model = OmniVoice.from_pretrained(
        "k2-fsa/OmniVoice",
        device_map="cuda:0",
        dtype=torch.float16,
        max_memory={0: "10GiB"}
    )

    elapsed = time.time() - start
    print(f"[VozPro] Modelo carregado em {elapsed:.1f}s")
    return model


# ============================================
# SPEED FIX AUTOMÁTICO
# ============================================

def _calculate_auto_speed(text: str, base_speed: float = 1.0) -> float:
    """
    Calcula a velocidade ideal do TTS baseado no texto.
    
    O modelo VozPro tende a falar MUITO RÁPIDO quando:
    - Texto tem muitas palavras difíceis (consoantes mudas, X, estrangeirismos)
    - Texto é longo (acelera progressivamente)
    - Texto tem travas-línguas ou termos técnicos
    
    Regras de ajuste:
    - Texto curto e simples (< 50 palavras): speed = 1.0
    - Texto médio (50-150 palavras): speed *= 0.90
    - Texto longo (> 150 palavras): speed *= 0.85
    - Texto com muitos termos difíceis: -0.05 extra
    - Mínimo: 0.75 (não fica lento demais)
    """
    import re
    
    words = text.split()
    word_count = len(words)
    
    # Contar indicadores de complexidade
    complex_patterns = [
        r'\b[ptgmn]\w{4,}',          # consoantes mudas (psico, pneu, gno, etc.)
        r'x',                         # letra X (múltiplos sons)
        r'\b[A-Z]{2,}\b',            # siglas (CNPJ, PDF, etc.)
        r'\b\d+[.,]\d+',             # números decimais
        r'R\$',                       # valores monetários
        r'\d+%',                      # porcentagens
        r'\(\d{2}\)',                 # DDD de telefone
        r'[áàãâéèêíïóôõúü]',         # acentos
    ]
    
    complexity_score = 0
    for pattern in complex_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        complexity_score += len(matches)
    
    # Calcular velocidade
    speed = base_speed
    
    # Ajuste por tamanho
    if word_count > 150:
        speed *= 0.85
    elif word_count > 80:
        speed *= 0.90
    elif word_count > 50:
        speed *= 0.95
    
    # Ajuste por complexidade
    complexity_ratio = complexity_score / max(word_count, 1)
    if complexity_ratio > 0.3:
        speed *= 0.90
    elif complexity_ratio > 0.15:
        speed *= 0.95
    
    # Limites
    speed = max(0.75, min(1.0, speed))
    speed = round(speed, 2)
    
    return speed


def generate_speech(
    text: str,
    mode: str = "clone",        # clone | design | auto
    instruct: str = "",          # voice design description
    ref_audio_path: str = "",   # path to reference audio file
    ref_text: str = "",         # transcription of reference audio (optional)
    num_step: int = 16,         # 16 = rapido, 32 = qualidade
    speed: float = 1.0,
    language: str = "",         # omitido = auto detect
    auto_speed: bool = True,    # ajuste automático de velocidade
):
    """Gera áudio usando VozPro."""
    m = load_model()

    if not text or not text.strip():
        raise gr.Error("Texto é obrigatório")

    # Speed fix automático: reduz velocidade para textos complexos
    if auto_speed and speed == 1.0:
        speed = _calculate_auto_speed(text.strip(), speed)

    print(f"[VozPro] Gerando: mode={mode}, speed={speed}, text={text[:80]}...")
    start = time.time()

    # Montar kwargs base
    kwargs = {
        "text": text.strip(),
        "num_step": num_step,
        "speed": speed,
    }

    if mode == "clone" and ref_audio_path:
        # Voice cloning com áudio de referência
        kwargs["ref_audio"] = ref_audio_path
        # ref_text é OPCIONAL - se vazio, Whisper transcreve automaticamente
        if ref_text and ref_text.strip():
            kwargs["ref_text"] = ref_text.strip()
        print(f"[VozPro] Voice Clone: ref={ref_audio_path}")

    elif mode == "design" and instruct:
        # Voice Design - só descrição textual
        kwargs["instruct"] = instruct.strip()
        print(f"[VozPro] Voice Design: instruct={instruct}")

    elif mode == "auto":
        # Auto voice - modelo escolhe sozinho
        print("[VozPro] Auto Voice (sem referência)")
    else:
        # Fallback para clone sem áudio -> auto
        if mode == "clone" and not ref_audio_path:
            print("[VozPro] Clone sem áudio, caindo para auto")
        elif mode == "design" and not instruct:
            print("[VozPro] Design sem instruct, caindo para auto")
        # kwargs ficam só com text/num_step/speed

    # Gerar
    audio_list = m.generate(**kwargs)
    audio_array = audio_list[0]
    # Liberar cache GPU apos geracao
    torch.cuda.empty_cache()

    elapsed = time.time() - start
    duration = len(audio_array) / SAMPLE_RATE
    rtf = elapsed / duration if duration > 0 else 0
    print(f"[VozPro] Gerado em {elapsed:.2f}s (duração={duration:.1f}s, RTF={rtf:.3f})")

    # Salvar como WAV temporário e retornar path
    out_path = tempfile.mktemp(suffix=".wav")
    sf.write(out_path, audio_array, SAMPLE_RATE)

    return out_path, f"Duração: {duration:.1f}s | RTF: {rtf:.3f} | Tempo: {elapsed:.1f}s | Speed: {speed}"


# ============================================
# INTERFACE GRADIO
# ============================================

def create_interface():
    """Cria a interface Gradio para o VozPro server."""

    with gr.Blocks(
        title="VozPro TTS Server",
        theme=gr.themes.Soft(),
    ) as demo:

        gr.Markdown("# VozPro TTS Server")
        gr.Markdown("Servidor TTS VozPro (k2-fsa) — RTF 0.025, Voice Design, 600+ idiomas")

        with gr.Row():
            with gr.Column(scale=2):
                mode = gr.Radio(
                    ["clone", "design", "auto"],
                    value="clone",
                    label="Modo de Voz",
                )
                text_input = gr.Textbox(
                    label="Texto para Sintetizar",
                    placeholder="Digite o texto aqui...",
                    lines=5,
                )
                instruct_input = gr.Textbox(
                    label="Voice Design (descrição da voz)",
                    placeholder='female, low pitch, british accent',
                    lines=2,
                    visible=True,
                )
                ref_audio = gr.Audio(
                    label="Áudio de Referência (3-10s)",
                    type="filepath",
                    visible=True,
                )
                ref_text = gr.Textbox(
                    label="Transcrição do áudio (opcional, vazio = auto Whisper)",
                    placeholder="Transcrição do áudio de referência...",
                    lines=2,
                    visible=True,
                )

                with gr.Row():
                    num_step = gr.Slider(
                        minimum=4, maximum=64, value=16, step=4,
                        label="Diffusion Steps (16=rapido, 32=qualidade)",
                    )
                    speed = gr.Slider(
                        minimum=0.5, maximum=2.0, value=1.0, step=0.1,
                        label="Velocidade (1.0=normal)",
                    )

                auto_speed_cb = gr.Checkbox(
                    value=True,
                    label="Auto Speed (reduz velocidade para textos complexos)",
                )

                generate_btn = gr.Button("🎙️ Gerar Áudio", variant="primary")

            with gr.Column(scale=1):
                info_output = gr.Textbox(label="Info", interactive=False, lines=3)
                audio_output = gr.Audio(label="Áudio Gerado", type="filepath")

        # Toggle visibility baseado no modo
        def update_visibility(mode):
            is_clone = mode == "clone"
            is_design = mode == "design"
            return {
                instruct_input: gr.Visible(is_design),
                ref_audio: gr.Visible(is_clone),
                ref_text: gr.Visible(is_clone),
            }

        mode.change(update_visibility, [mode], [instruct_input, ref_audio, ref_text])

        # Gerar
        def on_generate(text, mode, instruct, ref_audio, ref_text, num_step, speed, auto_speed):
            try:
                out_path, info = generate_speech(
                    text=text,
                    mode=mode,
                    instruct=instruct,
                    ref_audio_path=ref_audio if ref_audio else "",
                    ref_text=ref_text,
                    num_step=int(num_step),
                    speed=float(speed),
                    auto_speed=bool(auto_speed),
                )
                return info, out_path
            except Exception as e:
                return f"ERRO: {str(e)}", None

        generate_btn.click(
            on_generate,
            [text_input, mode, instruct_input, ref_audio, ref_text, num_step, speed, auto_speed_cb],
            [info_output, audio_output],
        )

        # API endpoint para chamadas programáticas (usado pelo Vercel tunnel route)
        demo.load(
            fn=on_generate,
            inputs=[text_input, mode, instruct_input, ref_audio, ref_text, num_step, speed],
            outputs=[info_output, audio_output],
            api_name="generate",
        )

    return demo


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VozPro TTS Server")
    parser.add_argument("--ip", default="0.0.0.0", help="IP para bindar")
    parser.add_argument("--port", type=int, default=7861, help="Porta do servidor")
    parser.add_argument("--share", action="store_true", help="Criar link público Gradio")
    args = parser.parse_args()

    print(f"[VozPro] Iniciando servidor em {args.ip}:{args.port}")

    # Carregar modelo antes de subir o servidor
    load_model()

    # Criar e lançar interface
    demo = create_interface()
    demo.launch(
        server_name=args.ip,
        server_port=args.port,
        share=args.share,
        show_error=True,
    )
