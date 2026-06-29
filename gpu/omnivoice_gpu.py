"""
omnivoice_gpu.py - Servidor NATIVO OmniVoice (sem Gradio)
Tudo em Python: carrega modelo, expoe API REST, gerencia GPU.
"""

import sys
import os
import subprocess

# Auto-instalar dependencias (se ja tiver, ignora silenciosamente)
for _pkg in ["uvicorn", "starlette", "soundfile", "numpy", "pedalboard", "librosa", "scipy"]:
    try:
        __import__(_pkg)
    except ImportError:
        print(f"[Setup] Instalando {_pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", _pkg, "-q"])

import gc as _gc
import threading
import time
import json
import tempfile
import base64
import io
import asyncio
import argparse
from typing import Optional

import torch

# ============================================================
# PATCH CRITICO: torch.float8_e8m0fnu
# transformers 5.x usa esse dtype no finegrained_fp8, mas so
# existe no torch 2.7+. Na inferencia do OmniVoice esse codigo
# FP8 NAO e executado. O patch DEVE rodar ANTES de qualquer
# import que toque transformers/omnivoice.
# ============================================================
if not hasattr(torch, 'float8_e8m0fnu'):
    print("[PATCH] torch.float8_e8m0fnu nao encontrado, criando alias para float8_e5m2")
    torch.float8_e8m0fnu = torch.float8_e5m2

import numpy as np
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

# ============================================================
# MANUTENCAO AUTOMATICA INTELIGENTE
# ============================================================
_gen_counter = 0
_gen_counter_lock = threading.Lock()

_gpu_name = ""
_gpu_total = 0.0

def _get_vram():
    """Retorna (allocated_gb, reserved_gb, usage_percent)."""
    if not torch.cuda.is_available():
        return 0, 0, 0
    alloc = torch.cuda.memory_allocated(0) / (1024**3)
    reserv = torch.cuda.memory_reserved(0) / (1024**3)
    pct = (reserv / _gpu_total) * 100 if _gpu_total > 0 else 0
    return alloc, reserv, pct

def _smart_cleanup(label=""):
    """Cleanup inteligente: gc.collect + empty_cache."""
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

# ============================================================
# PITCH-SHIFT REVERSO PARA VOZES GRAVES
# ============================================================
# Problema: OmniVoice distorce/robotiza vozes com frequencias graves baixas
# Solucao: pitch shift UP na entrada + pitch shift DOWN na saida (reverso)
#
# Ex: voz grave → +6.5 semitons na entrada → OmniVoice gera → -6.5 semitons na saida
# Resultado: voz original sem distorcao, modelo trabalha com frequencia mais confortavel

def _pitch_shift_audio(audio_array, sr, semitones):
    """
    Pitch shift de ALTA QUALIDADE usando PSOLA (Pitch Synchronous Overlap-Add)
    via librosa. Preserva formantes e identidade vocal.
    
    Vantagens sobre resample simples:
    - Preserva formantes (identidade/timbre da voz)
    - Sem artefatos de truncamento (corte/pad de samples)
    - Duracao exata preservada automaticamente
    - Muito melhor qualidade para shifts de 3-6 semitons
    
    Fallback: se librosa falhar, usa resample + time-stretch (metodo antigo).
    
    Args:
        audio_array: numpy array float32 (mono)
        sr: sample rate
        semitones: positivo = mais agudo, negativo = mais grave
    
    Returns:
        numpy array float32 com pitch shift aplicado, mesma duracao
    """
    if abs(semitones) < 0.1:
        return audio_array  # sem mudanca significativa
    
    orig_len = len(audio_array)
    
    # ============================================================
    # METODO PRINCIPAL: PSOLA via librosa (alta qualidade)
    # ============================================================
    try:
        import librosa
        
        shifted = librosa.effects.pitch_shift(
            audio_array.astype(np.float32),
            sr=sr,
            n_steps=semitones,
            n_fft=2048,
        )
        
        # librosa preserva duracao automaticamente
        if len(shifted) != orig_len:
            if len(shifted) > orig_len:
                shifted = shifted[:orig_len]
            else:
                shifted = np.pad(shifted, (0, orig_len - len(shifted)))
        
        print(f"[PitchShift] PSOLA {semitones:+.1f} semitons OK ({orig_len} -> {len(shifted)} samples, librosa)")
        return shifted.astype(np.float32)
    
    except ImportError:
        print("[PitchShift] librosa nao disponivel, usando resample fallback")
    except Exception as e:
        print(f"[PitchShift] PSOLA falhou ({e}), usando resample fallback")
    
    # ============================================================
    # FALLBACK: resample + corta/pad (metodo antigo, menor qualidade)
    # ============================================================
    try:
        import torchaudio
        
        rate = 2.0 ** (semitones / 12.0)
        waveform = torch.from_numpy(audio_array.astype(np.float32)).unsqueeze(0)
        
        new_sr = int(sr * rate)
        resampler = torchaudio.transforms.Resample(
            orig_freq=new_sr,
            new_freq=sr,
        )
        resampled = resampler(waveform)
        
        result_len = resampled.shape[1]
        if result_len > orig_len:
            result = resampled[:, :orig_len].squeeze(0).detach().numpy()
        elif result_len < orig_len:
            pad_size = orig_len - result_len
            result = torch.nn.functional.pad(resampled, (0, pad_size)).squeeze(0).detach().numpy()
        else:
            result = resampled.squeeze(0).detach().numpy()
        
        print(f"[PitchShift] Resample {semitones:+.1f} semitons OK ({orig_len} -> {len(result)} samples, fallback)")
        return result.astype(np.float32)
    
    except Exception as e2:
        print(f"[PitchShift] ERRO CRITICO: {e2}")
        return audio_array  # retornar sem shift e melhor que crashar


def _detect_grave_voice(instruct, ref_audio_name, ref_audio_array, sr):
    """
    Detecta se a voz de referencia e grave baseado em:
    1. Instruct contem 'low pitch' ou 'very low pitch'
    2. Nome do arquivo contem 'grave'
    3. Analise espectral via pyin (alta precisao) ou autocorrelacao (fallback)
    
    COM PSOLA (librosa), podemos usar shifts maiores com seguranca:
    - PSOLA preserva formantes, entao +6 semitons mantem a identidade vocal
    - Resample simples nao preserva formantes, por isso era limitado a +5
    
    Returns:
        float: semitones de pitch shift recomendado (0 = nao grave)
    """
    semitones = 0.0
    
    # 1. Instruct
    if instruct:
        lower = instruct.lower()
        if 'very low pitch' in lower:
            semitones = 6.0
        elif 'low pitch' in lower:
            semitones = 5.0
    
    # 2. Nome do arquivo
    if semitones == 0.0 and ref_audio_name:
        name_lower = ref_audio_name.lower()
        if 'grave' in name_lower:
            semitones = 5.0
    
    # 3. Analise espectral
    if semitones == 0.0 and ref_audio_array is not None and len(ref_audio_array) > sr * 0.5:
        try:
            f0 = None
            
            # 3a. Metodo preferido: pyin (alta precisao, analisa audio inteiro)
            try:
                import librosa
                f0_array, voiced_flags, voiced_probs = librosa.pyin(
                    ref_audio_array.astype(np.float32),
                    fmin=60,
                    fmax=500,
                    sr=sr,
                    frame_length=2048,
                )
                # Filtrar apenas frames com voz (voiced)
                voiced_f0 = f0_array[voiced_flags & (voiced_probs > 0.5)]
                if len(voiced_f0) > 5:
                    f0 = float(np.median(voiced_f0))
                    print(f"[GraveDetect] pyin: F0 mediana={f0:.0f}Hz ({len(voiced_f0)} frames com voz)")
            except ImportError:
                pass
            except Exception as e:
                print(f"[GraveDetect] pyin falhou ({e}), usando autocorrelacao")
            
            # 3b. Fallback: autocorrelacao (metodo antigo)
            if f0 is None and len(ref_audio_array) > sr:
                f0_estimates = []
                window_size = int(sr * 0.2)
                
                for offset_frac in [0.25, 0.5, 0.75]:
                    offset = int(len(ref_audio_array) * offset_frac) - window_size // 2
                    offset = max(0, min(offset, len(ref_audio_array) - window_size))
                    window = ref_audio_array[offset:offset + window_size].astype(np.float64)
                    window = window - np.mean(window)
                    
                    corr = np.correlate(window, window, mode='full')
                    corr = corr[len(corr)//2:]
                    
                    if corr[0] > 0:
                        corr = corr / corr[0]
                    
                    min_lag = int(sr / 500)
                    max_lag = int(sr / 60)
                    
                    if max_lag < len(corr):
                        search_range = corr[min_lag:max_lag]
                        if len(search_range) > 0 and np.max(search_range) > 0.3:
                            peak_lag = np.argmax(search_range) + min_lag
                            f0_estimates.append(sr / peak_lag)
                
                if f0_estimates:
                    f0 = float(np.median(f0_estimates))
                    print(f"[GraveDetect] Autocorrelacao: F0 mediana={f0:.0f}Hz")
            
            # Mapear F0 para semitones (limites mais altos com PSOLA)
            if f0 is not None:
                if f0 < 85:
                    semitones = 6.0
                elif f0 < 110:
                    semitones = 5.0
                elif f0 < 140:
                    semitones = 4.0
                elif f0 < 170:
                    semitones = 2.0
                
                if semitones > 0:
                    print(f"[GraveDetect] F0={f0:.0f}Hz -> pitch shift +{semitones:.0f} semitons")
                else:
                    print(f"[GraveDetect] F0={f0:.0f}Hz -> voz normal, sem shift")
        except Exception as e:
            print(f"[GraveDetect] Analise espectral falhou: {e}")
    
    return semitones


def _master_audio(audio_array, sr):
    """
    Masterizacao profissional do audio gerado:
    1. Remocao de DC offset
    2. Normalizacao para -1 dBFS (headroom)
    3. Compressao suave (pedalboard) — uniformiza volume
    4. Peak limiter (pedalboard) — evita clipping
    5. Fallback: soft clip (tanh) se pedalboard falhar
    
    Args:
        audio_array: numpy float32 (mono, -1.0 a 1.0)
        sr: sample rate
    
    Returns:
        numpy float32 masterizado
    """
    result = audio_array.copy()
    
    # 1. Remover DC offset
    result = result - np.mean(result)
    
    # 2. Normalizacao para -1 dB (deixar headroom para compressao)
    peak = np.max(np.abs(result))
    if peak > 0:
        target_peak = 10 ** (-1.0 / 20.0)  # -1 dBFS
        result = result * (target_peak / peak)
    
    # 3. Compressao suave + limiter via pedalboard
    try:
        from pedalboard import Pedalboard, Compressor, PeakLimiter
        
        board = Pedalboard([
            Compressor(threshold_db=-15, ratio=3.0, attack_ms=8, release_ms=80),
            PeakLimiter(threshold_db=-0.3, release_ms=50),
        ])
        
        # pedalboard espera float32 (channels, samples)
        result_board = board(result.astype(np.float32), sr)
        
        # Se retornou stereo, pegar mono
        if len(result_board.shape) > 1:
            result = result_board[0]
        else:
            result = result_board
            
        print(f"[Master] pedalboard OK (compressor + limiter)")
    except ImportError:
        # Fallback: soft clip simples
        threshold = 0.95
        result = np.tanh(result / threshold) * threshold
        print(f"[Master] soft clip fallback OK (pedalboard nao instalado)")
    except Exception as e:
        # Fallback: soft clip simples
        threshold = 0.95
        result = np.tanh(result / threshold) * threshold
        print(f"[Master] pedalboard falhou ({e}), soft clip fallback OK")
    
    return result.astype(np.float32)


def _split_text_for_generation(text, max_chars=250):
    """
    Divide texto longo em frases menores para o modelo não embaralhar a fala.
    O F5-TTS embaralha/repete palavras quando o texto é muito longo.
    Solução: gerar em trechos menores e concatenar os audios.
    """
    if len(text) <= max_chars:
        return [text]
    
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    chunks = []
    current_chunk = ""
    
    for sentence in sentences:
        if len(sentence) > max_chars:
            parts = sentence.split(', ')
            for part in parts:
                if len(current_chunk) + len(part) + 2 <= max_chars:
                    current_chunk = (current_chunk + ", " + part) if current_chunk else part
                else:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = part
        elif len(current_chunk) + len(sentence) + 1 <= max_chars:
            current_chunk = (current_chunk + " " + sentence) if current_chunk else sentence
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    if len(chunks) > 1:
        print(f"[SplitText] Texto longo ({len(text)} chars) dividido em {len(chunks)} trechos: {[len(c) for c in chunks]}")
    
    return chunks


# ============================================================
# MODELO OMNIVOICE (carregado uma vez)
# ============================================================
_model = None
SAMPLE_RATE = 24000

def load_model():
    """Carrega o modelo OmniVoice na GPU."""
    global _model, SAMPLE_RATE
    if _model is not None:
        return _model

    from omnivoice import OmniVoice

    print("[OmniVoice] Carregando modelo k2-fsa/OmniVoice na GPU...")
    start = time.time()

    _model = OmniVoice.from_pretrained(
        "k2-fsa/OmniVoice",
        device_map="cuda",
        dtype=torch.float16,
        load_asr=True,
    )

    SAMPLE_RATE = _model.sampling_rate
    print(f"[OmniVoice] Modelo carregado em {time.time() - start:.1f}s (sample_rate={SAMPLE_RATE})")
    return _model

def _pre_generate_cleanup():
    """Cleanup antes de gerar se VRAM estiver alta."""
    if not torch.cuda.is_available():
        return
    alloc, reserv, pct = _get_vram()
    print(f"[GPU] Antes geracao: {alloc:.2f}GB alloc / {reserv:.2f}GB reserv ({pct:.0f}%)")
    if pct > 80:
        print(f"[GPU] VRAM alta ({pct:.0f}%) — cleanup antes de gerar")
        _smart_cleanup("Pre")
        _, reserv2, pct2 = _get_vram()
        if pct2 > 90:
            print(f"[GPU] VRAM critica ({pct2:.0f}%) — deep cleanup")
            _deep_cleanup("Pre")
    else:
        torch.cuda.empty_cache()

def _post_generate_cleanup():
    """Cleanup depois de gerar + deep cleanup a cada 5 geracoes."""
    global _gen_counter
    if not torch.cuda.is_available():
        return
    _smart_cleanup("Pos")
    with _gen_counter_lock:
        _gen_counter += 1
        count = _gen_counter
        if _gen_counter >= 5:
            _gen_counter = 0
            _deep_cleanup("Auto5")
    _, reserv, pct = _get_vram()
    print(f"[GPU] Apos geracao #{count}: {reserv:.2f}GB ({pct:.0f}%)")

# ============================================================
# ENDPOINTS BASICOS
# ============================================================
async def index(request):
    """Rota raiz — info basica."""
    return JSONResponse({
        "service": "OmniVoice Native Server",
        "model_loaded": _model is not None,
        "gpu": _gpu_name if torch.cuda.is_available() else None,
        "endpoints": {
            "health": "GET /health",
            "status": "GET /api/maint/status",
            "cleanup": "POST /api/maint/cleanup",
            "asr": "POST /api/asr-transcribe",
            "generate": "POST /api/native-generate",
        },
    })

async def health(request):
    """Health check simples."""
    return JSONResponse({"status": "ok", "model_loaded": _model is not None})

async def maint_status(request):
    """VRAM da GPU e info."""
    _gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "cuda": torch.cuda.is_available(),
        "gpu": _gpu_name if torch.cuda.is_available() else None,
        "vram_total_gb": round(_gpu_total, 1) if torch.cuda.is_available() else 0,
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_free_gb": round((_gpu_total - reserv), 2) if torch.cuda.is_available() else 0,
        "vram_percent": round(pct, 1),
        "gen_counter": _gen_counter,
        "auto_cleanup": "active",
    })

async def maint_cleanup(request):
    """Forcar deep cleanup de GPU."""
    _deep_cleanup("API")
    alloc, reserv, pct = _get_vram()
    return JSONResponse({
        "status": "ok",
        "vram_alloc_gb": round(alloc, 2),
        "vram_reserved_gb": round(reserv, 2),
        "vram_percent": round(pct, 1),
    })

# ============================================================
# ENDPOINT PRINCIPAL: native_generate
# ============================================================
async def asr_transcribe(request):
    """POST /api/asr-transcribe — Transcreve audio via Whisper (ASR do OmniVoice).
    Recebe ref_audio_url ou ref_audio_base64, retorna texto transcrito.
    """
    import urllib.request
    import ssl
    import soundfile as _sf

    try:
        body = await request.json()
        ref_audio_url = body.get("ref_audio_url", "")
        ref_audio_base64 = body.get("ref_audio_base64", "")

        if not ref_audio_url and not ref_audio_base64:
            return JSONResponse({"status": "error", "error": "ref_audio_url ou ref_audio_base64 obrigatorio"}, status_code=400)

        if _model is None:
            return JSONResponse({"status": "error", "error": "Modelo nao carregado"}, status_code=503)

        # Baixar/decodificar audio
        audio_data = None
        ref_audio_path = ""

        try:
            if ref_audio_base64 and str(ref_audio_base64).strip():
                b64 = str(ref_audio_base64).strip()
                if ',' in b64 and b64.startswith('data:'):
                    b64 = b64.split(',', 1)[1]
                audio_data = base64.b64decode(b64)
                print(f"[ASR] Decodificando Base64: {len(audio_data)} bytes")
            elif ref_audio_url and str(ref_audio_url).strip():
                req = urllib.request.Request(ref_audio_url, headers={'User-Agent': 'OmniVoice/1.0'})
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                    audio_data = resp.read()
                print(f"[ASR] Baixando audio: {len(audio_data)} bytes")

            if not audio_data:
                return JSONResponse({"status": "error", "error": "Falha ao obter audio"}, status_code=400)

            # Validar que e audio real
            if len(audio_data) < 44:
                return JSONResponse({"status": "error", "error": "Audio muito curto"}, status_code=400)
            if audio_data[:5] == b'<?xml' or audio_data[:1] == b'<' or audio_data[:9] == b'<!DOCTYPE':
                return JSONResponse({"status": "error", "error": "URL retornou HTML, nao audio"}, status_code=400)

            # Salvar temporario
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(audio_data)
                ref_audio_path = f.name

            # Carregar e resample se necessario
            info = _sf.info(ref_audio_path)
            audio_array, sr = _sf.read(ref_audio_path)
            print(f"[ASR] Audio: {info.duration:.1f}s {sr}Hz")

            if len(audio_array.shape) > 1:
                audio_array = audio_array[:, 0]

            if sr != SAMPLE_RATE:
                import torchaudio
                tensor_audio = torch.from_numpy(audio_array.astype(np.float32)).unsqueeze(0)
                resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=SAMPLE_RATE)
                tensor_audio = resampler(tensor_audio)
                audio_array = tensor_audio.squeeze(0).detach().numpy()

            # Transcrever usando o modelo OmniVoice (Whisper-large-v3-turbo)
            loop = asyncio.get_event_loop()
            transcription = await loop.run_in_executor(
                None,
                lambda: _model.transcribe((audio_array, SAMPLE_RATE))
            )

            print(f"[ASR] Transcricao: '{str(transcription)[:100]}'")

            # Limpar temp
            if ref_audio_path and os.path.exists(ref_audio_path):
                try:
                    os.unlink(ref_audio_path)
                except Exception:
                    pass

            return JSONResponse({
                "status": "ok",
                "text": str(transcription),
                "duration": round(info.duration, 2),
            })

        except Exception as e:
            # Limpar temp em caso de erro
            if ref_audio_path and os.path.exists(ref_audio_path):
                try:
                    os.unlink(ref_audio_path)
                except Exception:
                    pass
            raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


async def native_generate(request):
    import urllib.request
    import ssl
    import soundfile as _sf

    try:
        body = await request.json()

        text_raw = body.get("text", "")
        if not text_raw or not text_raw.strip():
            return JSONResponse({"status": "error", "error": "Texto obrigatorio"})

        text = text_raw.strip()
        print(f"[Native] Processando: '{text[:60]}...'")

        voice_mode = body.get("voice_mode", "clone")
        language = body.get("language", "Auto")

        speed = body.get("speed", None)
        speed = 1.0 if speed is None else float(speed)

        num_step = body.get("num_step", None)
        num_step = 32 if num_step is None else int(num_step)

        guidance_scale = body.get("guidance_scale", None)
        guidance_scale = 2.0 if guidance_scale is None else float(guidance_scale)

        denoise = body.get("denoise", None)
        denoise = True if denoise is None else (denoise == True)

        postprocess_output = body.get("postprocess_output", None)
        postprocess_output = True if postprocess_output is None else (postprocess_output == True)

        preprocess_prompt = body.get("preprocess_prompt", True) == True
        instruct = body.get("instruct", "")
        ref_text = body.get("ref_text", "")
        ref_audio_url = body.get("ref_audio_url", "")
        ref_audio_base64 = body.get("ref_audio_base64", "")

        # ===================== VALIDAR INSTRUCT =====================
        # Itens VALIDOS do OmniVoice (lista da doc oficial):
        # american accent, australian accent, british accent, canadian accent,
        # child, chinese accent, elderly, female, high pitch, indian accent,
        # japanese accent, korean accent, low pitch, male, middle-aged,
        # moderate pitch, portuguese accent, russian accent, teenager,
        # very high pitch, very low pitch, whisper, young adult
        VALID_INSTRUCT = {
            'american accent', 'australian accent', 'british accent', 'canadian accent',
            'child', 'chinese accent', 'elderly', 'female', 'high pitch', 'indian accent',
            'japanese accent', 'korean accent', 'low pitch', 'male', 'middle-aged',
            'moderate pitch', 'portuguese accent', 'russian accent', 'teenager',
            'very high pitch', 'very low pitch', 'whisper', 'young adult',
        }

        if instruct and instruct.strip():
            raw_parts = [p.strip() for p in instruct.split(',')]
            valid_parts = []
            for part in raw_parts:
                lower = part.lower()
                if lower in VALID_INSTRUCT:
                    valid_parts.append(lower)
                else:
                    # Tentar match parcial (ex: "portuguese" → "portuguese accent")
                    matched = False
                    for v in VALID_INSTRUCT:
                        if lower in v or v.replace(' accent', '') == lower:
                            valid_parts.append(v)
                            matched = True
                            break
                    if not matched:
                        print(f"[Native] AVISO: Instruct invalido descartado: '{part}'")
            instruct = ', '.join(valid_parts) if valid_parts else ""
            if valid_parts != raw_parts:
                print(f"[Native] Instruct filtrado: '{instruct}'")

        if _model is None:
            return JSONResponse({"status": "error", "error": "Modelo nao carregado ainda"}, status_code=503)

        # ================================================================
        # PROCESSAR AUDIO DE REFERENCIA (so no modo clone)
        # Modos design e auto geram voz SEM referencia.
        # ================================================================
        ref_audio_array = None
        ref_audio_path = ""

        if voice_mode == 'clone':
            try:
                audio_data = None
                if ref_audio_base64 and str(ref_audio_base64).strip():
                    b64 = str(ref_audio_base64).strip()
                    if ',' in b64 and b64.startswith('data:'):
                        b64 = b64.split(',', 1)[1]
                    audio_data = base64.b64decode(b64)
                    print(f"[Native] Decodificando Base64: {len(audio_data)} bytes")
                elif ref_audio_url and str(ref_audio_url).strip():
                    req = urllib.request.Request(ref_audio_url, headers={'User-Agent': 'OmniVoice/1.0'})
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                        audio_data = resp.read()
                    print(f"[Native] Baixando ref_audio_url: {len(audio_data)} bytes")

                if audio_data:
                    # Validar que e audio real (nao HTML/erro de nginx)
                    if len(audio_data) < 44:
                        print(f"[Native] ERRO: audio de referencia muito curto ({len(audio_data)} bytes) — provavelmente erro HTTP")
                        audio_data = None
                    elif audio_data[:5] == b'<?xml' or audio_data[:1] == b'<' or audio_data[:9] == b'<!DOCTYPE':
                        print(f"[Native] ERRO: ref_audio_url retornou HTML/XML, nao audio — URL invalida?")
                        audio_data = None
                    elif b'<html' in audio_data[:500].lower():
                        print(f"[Native] ERRO: ref_audio_url retornou pagina HTML, nao audio")
                        audio_data = None
                
                if audio_data:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        f.write(audio_data)
                        ref_audio_path = f.name
            except Exception as e:
                print(f"[Native] Erro ao processar referencia: {e}")

            if not ref_audio_path or not os.path.exists(ref_audio_path):
                return JSONResponse({"status": "error", "error": "Audio de referencia nao encontrado (modo clone exige referencia)"}, status_code=400)

            # Carregar e resample se necessario
            try:
                info = _sf.info(ref_audio_path)
                ref_audio_array, ref_sr = _sf.read(ref_audio_path)
                print(f"[Native] Ref audio: {info.duration:.1f}s {ref_sr}Hz")

                if len(ref_audio_array.shape) > 1:
                    ref_audio_array = ref_audio_array[:, 0]

                if ref_sr != SAMPLE_RATE:
                    import torchaudio
                    tensor_audio = torch.from_numpy(ref_audio_array.astype(np.float32)).unsqueeze(0)
                    resampler = torchaudio.transforms.Resample(orig_freq=ref_sr, new_freq=SAMPLE_RATE)
                    tensor_audio = resampler(tensor_audio)
                    ref_audio_array = tensor_audio.squeeze(0).detach().numpy()
                    print(f"[Native] Resampling: {ref_sr} -> {SAMPLE_RATE}")

                # Resampling necessario (modelo exige 24kHz) — isso nao altera o audio,
                # so converte o formato. Audio segue CRU para o OmniVoice.
                # SEM trim de silencio, SEM truncamento — o modelo processa tudo.
            except Exception as e:
                print(f"[Native] Erro ao carregar audio: {e}")
                return JSONResponse({"status": "error", "error": f"Falha ao carregar audio: {e}"}, status_code=500)
        else:
            print(f"[Native] Modo {voice_mode}: sem audio de referencia (usa instruct ou aleatorio)")

        # ================================================================
        # MONTAR KWARGS
        # ================================================================
        try:
            from omnivoice import OmniVoiceGenerationConfig
            gen_config = OmniVoiceGenerationConfig(
                num_step=int(num_step or 32),
                guidance_scale=float(guidance_scale) if guidance_scale is not None else 2.0,
                denoise=bool(denoise) if denoise is not None else True,
                preprocess_prompt=bool(preprocess_prompt),
                postprocess_output=bool(postprocess_output) if postprocess_output is not None else True,
            )
        except ImportError:
            gen_config = None

        # Language: deixar o modelo detectar (Auto) — ele sabe fazer isso
        lang = language if (language and language != "Auto") else None

        if gen_config is not None:
            kw = dict(text=text.strip(), language=lang, generation_config=gen_config)
        else:
            kw = dict(text=text.strip(), num_step=int(num_step or 32), guidance_scale=float(guidance_scale) if guidance_scale is not None else 2.0)
            if lang is not None:
                kw["language"] = lang

        if speed is not None and float(speed) != 1.0:
            kw["speed"] = float(speed)

        # duration: deixar sempre vazio (0/nulo) para usar speed padrao
        # O modelo OmniVoice usa speed para controlar ritmo — duration fixo
        # pode causar atropelo e artefatos.

        # NOTE: instruct é passado DIRETO do frontend/admin para o modelo
        # Sem auto-deteccao — o OmniVoice processa tudo cru
        if instruct and instruct.strip():
            kw["instruct"] = instruct.strip()

        # ================================================================
        # PITCH-SHIFT REVERSO PARA VOZES GRAVES
        # Detecta se a voz e grave e aplica pitch shift na entrada
        # (sera revertido na saida para restaurar o tom original)
        # ================================================================
        # PITCH-SHIFT DESATIVADO — PSOLA causava audio metalico/lata
        # A auto-detecção de voz grave (+2 semitons na entrada, -2 na saida)
        # produzia som robotico. O modelo clone já clona o tom naturalmente.
        # Só ativar se o frontend mandar explicitamente pitch_shift != 0.
        # ================================================================
        pitch_shift_semitones = 0.0

        # Parametro explicito do frontend/PHP — SÓ usar se for valor numérico não-nulo
        explicit_pitch_shift = body.get("pitch_shift", None)
        if explicit_pitch_shift is not None and explicit_pitch_shift != 0 and str(explicit_pitch_shift).strip() not in ('', '0', '0.0', 'null', 'None'):
            pitch_shift_semitones = float(explicit_pitch_shift)
            if pitch_shift_semitones != 0:
                print(f"[PitchShift] Explicito: {pitch_shift_semitones:+.1f} semitons")
        # AUTO-DETECÇÃO DESATIVADA — era a causa do som de lata
        # elif voice_mode == 'clone' and ref_audio_array is not None:
        #     ref_audio_name = body.get("ref_audio_name", "") or body.get("referenceAudioName", "")
        #     pitch_shift_semitones = _detect_grave_voice(instruct, ref_audio_name, ref_audio_array, SAMPLE_RATE)

        # Aplicar pitch shift na ENTRADA (ref_audio) se detectado grave
        if pitch_shift_semitones != 0.0 and voice_mode == 'clone' and ref_audio_array is not None:
            print(f"[PitchShift] ENTRADA: +{pitch_shift_semitones:.1f} semitons no ref_audio")
            ref_audio_array = _pitch_shift_audio(ref_audio_array, SAMPLE_RATE, pitch_shift_semitones)

        # _ref_text inicializado para evitar NameError em modos nao-clone
        _ref_text = None

        # Voice clone — MANDA TUDO CRU pro OmniVoice
        # Sem AutoASR, sem auto-instruct, sem pre-processamento
        # O modelo processa tudo naturalmente como na interface nativa
        if voice_mode == 'clone' and ref_audio_array is not None:
            _ref_text = ref_text.strip() if ref_text and ref_text.strip() else None

            kw["ref_audio"] = (ref_audio_array, SAMPLE_RATE)
            if _ref_text:
                kw["ref_text"] = _ref_text
                print(f"[Native] Clone: ref_audio + ref_text ('{_ref_text[:50]}{'...' if len(_ref_text) > 50 else ''}')")
            else:
                print(f"[Native] Clone: ref_audio SEM ref_text (modelo transcreve internamente)")

            # instruct passado direto do frontend/admin — sem auto-deteccao
            if instruct and instruct.strip():
                kw["instruct"] = instruct.strip()
        elif voice_mode == 'auto':
            # Modo auto: sem instruct, sem referencia — modelo escolhe voz livre
            print(f"[Native] Modo auto: modelo escolhe a voz")
        else:
            # Modo design: instruct ja foi adicionado ao kw acima
            print(f"[Native] Modo design: instruct='{instruct.strip() if instruct else '(vazio)'}'")

        # ================================================================
        # GERAR — com split de texto longo (necessário para não embaralhar)
        # ================================================================
        _pre_generate_cleanup()

        # Texto CRU — sem split, o OmniVoice processa texto inteiro
        text_chunks = [text]
        
        all_audio = []
        total_gen_time = 0.0

        for chunk_idx, chunk_text in enumerate(text_chunks):
            chunk_kw = dict(kw)
            chunk_kw["text"] = chunk_text.strip()
            
            if voice_mode == 'clone' and ref_audio_array is not None:
                chunk_kw["ref_audio"] = (ref_audio_array, SAMPLE_RATE)
            
            chunk_label = f" [{chunk_idx+1}/{len(text_chunks)}]" if len(text_chunks) > 1 else ""
            _ref_text_preview = (_ref_text[:30] + '...') if _ref_text and len(_ref_text) > 30 else (_ref_text if _ref_text else '(sem ref_text)')
            print(f"[Native] Gerando{chunk_label}: mode={voice_mode} lang={lang or 'Auto'} speed={speed} cfg={guidance_scale} steps={num_step} denoise={denoise} postprocess={postprocess_output} instruct='{instruct}' ref_text='{_ref_text_preview}' pitch_shift={pitch_shift_semitones:+.1f} text='{chunk_text[:40]}...'")
            
            start_chunk = time.time()
            loop = asyncio.get_event_loop()
            audio_list = await loop.run_in_executor(None, lambda k=chunk_kw: _model.generate(**k))
            elapsed_chunk = time.time() - start_chunk
            total_gen_time += elapsed_chunk

            chunk_audio = audio_list[0]
            if hasattr(chunk_audio, "cpu"):
                chunk_audio = chunk_audio.cpu().detach().numpy()
            
            # Pitch-shift reverso na SAIDA para cada trecho
            if pitch_shift_semitones != 0.0:
                if chunk_idx == 0:
                    print(f"[PitchShift] SAIDA: {-pitch_shift_semitones:+.1f} semitons no audio gerado")
                chunk_audio = _pitch_shift_audio(chunk_audio.astype(np.float32), SAMPLE_RATE, -pitch_shift_semitones)
            
            all_audio.append(chunk_audio)
            print(f"[Native] Trecho{chunk_label} OK: {elapsed_chunk:.2f}s ({len(chunk_audio)/SAMPLE_RATE:.1f}s audio)")

        # Concatenar trechos
        raw_audio = np.concatenate(all_audio) if len(all_audio) > 1 else all_audio[0]
        elapsed = total_gen_time

        # ================================================================
        # TRIM NA SAIDA DESATIVADO
        # O trim de silencio cortava fala real no final de vozes agudas.
        # A "fala fantasma" no inicio era causada pelo PSOLA pitch-shift,
        # que ja foi desativado. Sem PSOLA, nao precisa de trim na saida.
        # ================================================================

        # ================================================================
        # MASTERIZACAO
        # Normalizacao + compressao suave + limiter
        # ================================================================
        enable_master = body.get("master", True) == True
        if enable_master:
            raw_audio = _master_audio(raw_audio.astype(np.float32), SAMPLE_RATE)

        waveform_int16 = (raw_audio * 32767).astype(np.int16)
        audio_duration = len(waveform_int16) / SAMPLE_RATE
        rtf = elapsed / audio_duration if audio_duration > 0 else 0
        chunks_info = f" ({len(text_chunks)} trechos)" if len(text_chunks) > 1 else ""
        print(f"[Native] OK: {elapsed:.2f}s (duracao={audio_duration:.1f}s, RTF={rtf:.3f}){chunks_info}")

        _post_generate_cleanup()

        buf = io.BytesIO()
        _sf.write(buf, waveform_int16, SAMPLE_RATE, format='WAV', subtype='PCM_16')
        wav_bytes = buf.getvalue()

        # Limpar temp
        if ref_audio_path and os.path.exists(ref_audio_path):
            try:
                os.unlink(ref_audio_path)
            except Exception:
                pass

        return JSONResponse({
            "status": "ok",
            "audio_base64": base64.b64encode(wav_bytes).decode('ascii'),
            "audio_size": len(wav_bytes),
            "duration": round(audio_duration, 2),
            "generation_time": round(elapsed, 2),
            "rtf": round(rtf, 4),
            "pitch_shift_applied": pitch_shift_semitones,
            "master_applied": enable_master,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


# ============================================================
# APP STARLETTE
# ============================================================
app = Starlette(
    routes=[
        Route("/", index, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route("/api/maint/status", maint_status, methods=["GET"]),
        Route("/api/maint/cleanup", maint_cleanup, methods=["POST"]),
        Route("/api/asr-transcribe", asr_transcribe, methods=["POST"]),
        Route("/api/native-generate", native_generate, methods=["POST"]),
    ],
    middleware=[
        Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
    ],
)


# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    import uvicorn

    parser = argparse.ArgumentParser(description="OmniVoice Native Server")
    parser.add_argument("--ip", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()

    if torch.cuda.is_available():
        _gpu_name = torch.cuda.get_device_name(0)
        _gpu_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print("=" * 55)
        print(f" OmniVoice Native Server - {_gpu_name}")
        print(f" VRAM: {_gpu_total:.1f} GB")
        print("=" * 55)
        torch.cuda.empty_cache()

        _monitor_thread = threading.Thread(target=_background_monitor, daemon=True)
        _monitor_thread.start()
    else:
        print("[AVISO] CUDA nao disponivel")

    load_model()

    print("=" * 55)
    print(f" Endpoints:")
    print(f"  GET  /health              (health check)")
    print(f"  GET  /api/maint/status    (VRAM + info)")
    print(f"  POST /api/maint/cleanup   (forcar cleanup)")
    print(f"  POST /api/native-generate (geracao nativa)")
    print(f"  POST /api/asr-transcribe (transcricao ASR)")
    print("=" * 55)

    uvicorn.run(app, host=args.ip, port=args.port, log_level="warning")