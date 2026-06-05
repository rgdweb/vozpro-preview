#!/usr/bin/env python3
"""
Conversor IPA → texto PT-BR legível para TTS.
Usa espeak-ng para gerar IPA e converte para pronúncia em texto.
"""

import subprocess
import json
import re
import sys

def get_ipa(word):
    try:
        r = subprocess.run(
            ['espeak-ng', '-v', 'pt-br', '-q', '--ipa', '-x', word],
            capture_output=True, text=True, timeout=5
        )
        return r.stdout.strip()
    except:
        return None

def ipa_to_text(ipa):
    """Converte IPA do eSpeak para texto PT-BR que o TTS lê corretamente."""
    if not ipa:
        return None
    
    t = ipa
    
    # === VOGAIS ===
    # Mapeamento completo vogais IPA → PT-BR
    t = t.replace('ɐ̃', 'am')   # ã (nasal aberto) - não, mamãe
    t = t.replace('ɐ̃', 'am')   # ã
    t = t.replace('ɐ', 'a')     # a aberto
    t = t.replace('æ', 'e')     # a→e (para, ela) 
    t = t.replace('ɐ', 'a')     # a
    
    # Vogais nasais
    t = t.replace('ẽ', 'en')    # em nasal
    t = t.replace('ĩ', 'in')    # im nasal  
    t = t.replace('õ', 'om')    # om nasal
    t = t.replace('ũ', 'um')    # um nasal
    
    # Semivogais
    t = t.replace('j̃', 'nh')   # nh
    t = t.replace('w̃', 'nh')   # nh variante
    
    # Ditongos nasais comuns
    t = t.replace('ɐ̃ʊ̃', 'ão')
    t = t.replace('ɐ̃ĩ̃', 'ãe')
    t = t.replace('ẽɪ̃', 'ẽi')
    t = t.replace('õɪ̃', 'õi')
    t = t.replace('ũɪ̃', 'ũi')
    
    # Ditongos
    t = t.replace('aɪ̯', 'ai')
    t = t.replace('aʊ̯', 'au')
    t = t.replace('eɪ̯', 'ei')
    t = t.replace('eʊ̯', 'eu')
    t = t.replace('i̯', 'i')
    t = t.replace('oɪ̯', 'oi')
    t = t.replace('u̯', 'u')
    
    # === CONSOANTES ===
    # Não PT-BR
    t = t.replace('dʒ', 'j')    # j como em "jato"
    t = t.replace('tʃ', 'x')    # ch como em "chave"
    t = t.replace('ɲ', 'nh')    # nh
    t = t.replace('ʎ', 'lh')    # lh  
    t = t.replace('ʃ', 'x')     # x/ch
    t = t.replace('ʒ', 'j')     # j/g
    t = t.replace('ɾ', 'r')     # r simples
    t = t.replace('ɾ̃', 'r')    # r nasal
    t = t.replace('R', 'rr')    # r forte
    t = t.replace('ŋ', 'ng')    # ng
    t = t.replace('w', 'u')     # w→u
    t = t.replace('θ', 't')     # th (não PT)
    t = t.replace('ð', 'd')     # dh (não PT)
    t = t.replace('ˈ', '')      # stress primário
    t = t.replace('ˌ', '')      # stress secundário
    t = t.replace('ː', '')      # vogal longa
    t = t.replace('˜', '')      # nasalização residual
    t = t.replace('.', '')      # sílaba
    t = t.replace(' ', '')      # espaços
    
    return t.strip()

# === TESTAR CONVERSÃO ===
test_words = [
    'hoje', 'história', 'homem', 'hotel', 'humor',
    'exame', 'exceção', 'táxi', 'México', 'enxada',
    'mulher', 'ilha', 'carro', 'raio', 'sangue',
    'pneumonia', 'gnomo', 'mnemônico',
    'você', 'também', 'não', 'quando',
]

print("=== TESTE IPA → TEXTO ===")
for word in test_words:
    ipa = get_ipa(word)
    text = ipa_to_text(ipa) if ipa else 'N/A'
    diff = '✓ CORRIGE' if text and text.lower() != word.lower() else '  ok'
    print(f"  {word:15s} → IPA: {ipa or 'N/A':20s} → TEXTO: {text:15s} {diff}")

# === GERAR DICIONÁRIO COMPLETO ===
print("\n=== GERANDO DICIONÁRIO DAS TOP 10000 PALAVRAS ===")

from wordfreq import top_n_list

words = top_n_list('pt', 10000)
dictionary = {}
stats = {'total': 0, 'diff': 0, 'same': 0}

for word in words:
    if len(word) < 3:
        continue
    if not re.match(r'^[a-zà-üA-ZÀ-Ü]+$', word):
        continue
    
    ipa = get_ipa(word)
    if not ipa:
        continue
    
    text = ipa_to_text(ipa)
    stats['total'] += 1
    
    if text and text.lower() != word.lower() and len(text) > 1:
        # Só adicionar se a correção é significativa
        # (não apenas acentuação/tônica diferente)
        word_cons = re.sub(r'[aeiouãõâêîôûáéíóúàèìòùAEIOUÃÕÂÊÎÔÛÁÉÍÓÚÀÈÌÒÙ]', '', word)
        text_cons = re.sub(r'[aeiouãõâêîôûáéíóúàèìòùAEIOUÃÕÂÊÎÔÛÁÉÍÓÚÀÈÌÒÙ]', '', text)
        
        if word_cons != text_cons or len(word) != len(text):
            dictionary[word] = text
            stats['diff'] += 1
        else:
            stats['same'] += 1

print(f"Analisadas: {stats['total']}")
print(f"Diferenças encontradas: {stats['diff']}")
print(f"Iguais (sem correção): {stats['same']}")

# Salvar
out = '/home/z/my-project/vozpro-source/scripts/dict-espeak.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(dictionary, f, ensure_ascii=False, indent=2)

print(f"\nSalvo: {out}")

# Mostrar amostra
print("\n=== AMOSTRA DE CORREÇÕES (primeiras 40) ===")
for word, pron in list(dictionary.items())[:40]:
    print(f"  '{word}': '{pron}',")
