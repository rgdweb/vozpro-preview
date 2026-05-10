#!/usr/bin/env python3
"""
Gerador de dicionário de pronúncia PT-BR para VozPro TTS.
Usa: wordfreq + espeak-ng + regras heurísticas
"""

import json
import re
import subprocess
from collections import OrderedDict

from wordfreq import top_n_list

print("=== FASE 1: Obtendo palavras comuns do PT-BR ===")
words = top_n_list('pt', 50000)
print(f"Palavras obtidas: {len(words)}")

print("\n=== FASE 2: Gerando fonemas com espeak-ng ===")

def get_ipa(word):
    try:
        result = subprocess.run(
            ['espeak-ng', '-v', 'pt-br', '-q', '--ipa', '-x', word],
            capture_output=True, text=True, timeout=5
        )
        ipa = result.stdout.strip()
        return ipa
    except Exception:
        return None

print("\n=== FASE 3: Correções manuais de alta prioridade ===")

MANUAL = {}
MANUAL.update({
    # H mudo
    'hoje': 'oje', 'Hoje': 'Oje',
    'hora': 'ora', 'Hora': 'Ora',
    'homem': 'omem', 'Homem': 'Omem',
    'humor': 'umor', 'Humor': 'Umor',
    'hotel': 'otel', 'Hotel': 'Otel',
    'história': 'istória', 'História': 'Istória',
    'herança': 'erança', 'Herança': 'Erança',
    'hernia': 'érnia', 'Hérnia': 'Érnia',
    'habilidade': 'abilidade', 'Habilidade': 'Abilidade',
    'hidráulico': 'idráulico', 'Hidráulico': 'Idráulico',
    'homicídio': 'omicídio', 'Homicídio': 'Omicídio',
    'hierarquia': 'ierarquia', 'Hierarquia': 'Ierarquia',
    # PS/PN mudo
    'pneu': 'peneu', 'Pneu': 'Peneu',
    'pneus': 'peneus', 'Pneus': 'Peneus',
    'pneumonia': 'peneumonia', 'Pneumonia': 'Peneumonia',
    'ptose': 'petose', 'Ptose': 'Petose',
    # GN mudo
    'gnomo': 'nomo', 'Gnomo': 'Nomo',
    'gnóstico': 'nóstico', 'Gnóstico': 'Nóstico',
    # EX prefix
    'exame': 'ezame', 'Exame': 'Ezame',
    'exato': 'ezato', 'Exato': 'Ezato',
    'exceção': 'ezeção', 'Exceção': 'Ezeção',
    'excluir': 'ezcluir', 'Excluir': 'Ezcluir',
    'executar': 'ezecutar', 'Executar': 'Ezecutar',
    'excesso': 'ecesço', 'Excesso': 'Ecesço',
    'excelência': 'ecelência', 'Excelência': 'Ecelência',
    'excelente': 'ecelente', 'Excelente': 'Ecelente',
    'exigir': 'ezigir', 'Exigir': 'Ezigir',
    'experiência': 'esperiência', 'Experiência': 'Esperiência',
    'explicar': 'espliquecar', 'Explicar': 'Espliquecar',
    'explícito': 'esplícito', 'Explícito': 'Esplícito',
    'explorar': 'esplorar', 'Explorar': 'Esplorar',
    'expressar': 'espressar', 'Expressar': 'Espressar',
    'expresso': 'espresso', 'Expresso': 'Espresso',
    'explosão': 'esplosão', 'Explosão': 'Esplosão',
    'extensão': 'estensão', 'Extensão': 'Estensão',
    'extenso': 'estenso', 'Extenso': 'Estenso',
    'exterior': 'esterior', 'Exterior': 'Esterior',
    'externo': 'esterno', 'Externo': 'Esterno',
    'extra': 'éstra', 'Extra': 'Éstra',
    'extraordinário': 'etraordinário', 'Extraordinário': 'Etraordinário',
    'expediente': 'espediente', 'Expediente': 'Espediente',
    'exposição': 'esposição', 'Exposição': 'Esposição',
    'exercício': 'ezercício', 'Exercício': 'Ezercício',
    'exemplo': 'ezemplo', 'Exemplo': 'Ezemplo',
    'exército': 'ezército', 'Exército': 'Ezército',
    'existir': 'ezistir', 'Existir': 'Ezistir',
    'exportar': 'esportar', 'Exportar': 'Esportar',
    'exploração': 'esploração', 'Exploração': 'Esploração',
    'expedir': 'espedir', 'Expedir': 'Espedir',
    'exibição': 'esibição', 'Exibição': 'Esibição',
    'exorbitante': 'esorbitante', 'Exorbitante': 'Esorbitante',
    'exótico': 'ezótico', 'Exótico': 'Ezótico',
    'exumação': 'ezumação', 'Exumação': 'Ezumação',
    # X problemático
    'táxi': 'tácsi', 'enxada': 'enchada', 'enxergar': 'enxergar',
    'México': 'Méssico', 'vexame': 'vessame',
    # Estrangeirismos
    'marketing': 'marqueting', 'Marketing': 'Marqueting',
    'download': 'daunloud', 'Download': 'Daunloud',
    'upload': 'aploud', 'Upload': 'Aploud',
    'software': 'softeuér', 'Software': 'Softeuér',
    'hardware': 'ardeuér', 'Hardware': 'Ardeuér',
    'mouse': 'mause', 'Mouse': 'Mause',
    'link': 'linque', 'Link': 'Linque',
    'links': 'linques', 'Links': 'Linques',
    'online': 'onlaine', 'Online': 'Onlaine',
    'offline': 'offlaine', 'Offline': 'Offlaine',
    'browser': 'brauzér', 'Browser': 'Brauzér',
    'app': 'épe', 'App': 'Épe',
    'apps': 'épes', 'Apps': 'Épes',
    'startup': 'startape', 'Startup': 'Startape',
    'feedback': 'fidebáque', 'Feedback': 'Fidebáque',
    'layout': 'leiáute', 'Layout': 'Leiáute',
    'design': 'dizaine', 'Design': 'Dizaine',
    'sprint': 'esprinte', 'Sprint': 'Esprinte',
    'benchmark': 'benchmarque', 'Benchmark': 'Benchmarque',
    'hacker': 'ráquer', 'Hacker': 'Ráquer',
    'podcast': 'podcáste', 'Podcast': 'Podcáste',
    'vlog': 'vlogue', 'Vlog': 'Vlogue',
    'blog': 'blogue', 'Blog': 'Blogue',
    'email': 'imeil', 'e-mail': 'imeil',
    'site': 'sáite', 'Site': 'Sáite',
    'smartphone': 'smartifone', 'Smartphone': 'Smartifone',
    'hashtag': 'rastague', 'Hashtag': 'Rastague',
    'influencer': 'influenser', 'Influencer': 'Influenser',
    'live': 'laive', 'Live': 'Laive',
    'streaming': 'estrimingue', 'Streaming': 'Estrimgue',
    'background': 'bécigraunde',
    'framework': 'freimeuorquê',
    'office': 'ófice', 'Office': 'Ófice',
    'business': 'biznise',
    'performance': 'perfománsse',
    'standard': 'stándarde',
    'ranking': 'ranquingue',
    'manager': 'manájer',
    'partner': 'pártenér',
    'delivery': 'delivéri',
    'coffee': 'cófi',
    'meeting': 'mitingue',
    'home': 'roume',
    'upgrade': 'apgreide',
    'downgrade': 'daungreide',
    'backup': 'bécape',
    'chip': 'tchip',
    'pixel': 'píxél',
    'click': 'clique',
    'touch': 'tache',
    'display': 'displei',
    'storage': 'estoráge',
    'server': 'servér',
    'router': 'ráuter',
    'patch': 'pétch',
    'spray': 'espréi',
    'sticker': 'stiquér',
    'kit': 'quité',
    'smart': 'smárte',
    'factory': 'fáctore',
    'outdoor': 'aútedor',
    'play': 'plei',
    'stop': 'stope',
    'start': 'stárte',
    'fast': 'fáste',
    'food': 'fude',
    'center': 'senter',
    'shopping': 'choping',
    'fitness': 'fitnes',
    'personal': 'perssonal',
    'trainer': 'treiner',
    'crossfit': 'crosfite',
    'boot': 'búte',
    'bootcamp': 'butecâmpe',
    'coding': 'codingue',
    'debug': 'dibague',
    'deploy': 'diploi',
    'commit': 'comite',
    'token': 'toquên',
    'cookies': 'cúquis',
    'script': 'escripte',
    'prompt': 'prompete',
    'bot': 'bote',
    'chat': 'chate',
    'share': 'chere',
    'like': 'laique',
    'post': 'póste',
    'tag': 'tegue',
    'viral': 'vairal',
    'geek': 'guique',
    'nerd': 'nerde',
    'remix': 'remixe',
    'gameplay': 'gemeplei',
    'score': 'escóre',
    'goal': 'gole',
    'penalti': 'penalte',
    'shoot': 'chute',
    'match': 'métche',
    'round': 'raunde',
    'showroom': 'chorume',
    'logout': 'logoúte', 'Logout': 'Logoúte',
    'Wi-Fi': 'uái fái', 'wifi': 'uái fái',
    # Siglas
    'API': 'a p i', 'DVD': 'dê vê dê', 'GPS': 'gê pê és',
    'IPTU': 'i pê tê u', 'INSS': 'i êne és és', 'URL': 'u erre éle',
    'PDF': 'pê dê éfe', 'HTML': 'agá tê ême éle', 'CSS': 'cê és és',
    'CRM': 'cê erre ême', 'CNPJ': 'cê êne pê jota', 'CPF': 'cê pê éfe',
    'RG': 'erre gê', 'IMC': 'i ême cê', 'CEP': 'cê ê pê',
    'SUV': 'ês u vê', 'IBGE': 'i bê gê i', 'PNG': 'pê êne gê',
    'JPG': 'jota pê gê', 'GIF': 'gife', 'USB': 'u és bê',
    'CEO': 'cê e i ó', 'CFO': 'cê éfe ó', 'CTO': 'cê tê ó',
    'GPT': 'gê pê tê', 'LLM': 'éle éleême', 'VPN': 'vê pê éne',
    'IA': 'i á', 'PC': 'pê cê', 'TV': 'tê vê',
    'Discord': 'Discorde', 'OpenAI': 'Open AI',
    'PostgreSQL': 'Postgres QL', 'GraphQL': 'Graph QL',
    'Vercel': 'Versel', 'Figma': 'Fígma', 'Canva': 'Cánva',
    'Trello': 'Trélo', 'Asana': 'Azana', 'Slack': 'Slace',
    'Supabase': 'Supabeise', 'Firebase': 'Faíberbeise',
    'Heroku': 'Herócue', 'Azure': 'ézurre',
    'DigitalOcean': 'Digital Océan', 'AWS': 'a dabliu és', 'GCP': 'gê cê pê',
    # Financeiro
    'DRE': 'dê erre e', 'EBITDA': 'ebitida', 'ROI': 'erre ó i',
    'ROE': 'erre ó e', 'ROA': 'erre ó a', 'EBIT': 'e bê i tê',
    'CAPEX': 'cápex', 'OPEX': 'óplex', 'Spread': 'espréde',
    'NPS': 'ême pê és', 'KPI': 'cê pê i', 'SLA': 'és éle a',
    # Jurídico
    'STF': 'és tê éfe', 'STJ': 'és tê jota', 'OAB': 'ô a bê',
    'TJ': 'tê jota', 'TRF': 'tê erre éfe', 'TSE': 'tê és e',
    'TRE': 'tê erre e', 'MP': 'ême pê',
    # Educação
    'ENEM': 'é nê éme', 'USP': 'u és pê', 'UNICAMP': 'unicampe',
    'TCC': 'tê cê cê', 'Campus': 'câmpus',
    # Governo
    'ANP': 'a êne pê', 'PF': 'pê éfe', 'CGU': 'cê gê u',
    'TCU': 'tê cê u',
    # Outros
    'paçoca': 'passoca', 'hipertensão': 'ipertensão',
    'hidroxicloroquina': 'idroxicloroquina',
    'hemodiálise': 'emodiálise',
    'mnemônico': 'nemônico', 'Mnemônico': 'Nemônico',
    'mnemônica': 'nemônica', 'Mnemônica': 'Nemônica',
})

problematic = dict(MANUAL)

print(f"Correções manuais: {len(MANUAL)}")

# ============================================================
# 4. ESPEAK — detectar mais problemas nas top 5000 palavras
# ============================================================
print("\n=== FASE 4: Analisando top 5000 com espeak-ng ===")

skip = re.compile(r'^[0-9\.\-\_\s]+$|^[a-z]$', re.IGNORECASE)

for word in words[:5000]:
    if len(word) < 3 or skip.match(word):
        continue
    if word in problematic:
        continue
    if not re.match(r'^[a-zà-üA-ZÀ-Ü]+$', word):
        continue

    ipa = get_ipa(word)
    if not ipa or len(ipa) < 2:
        continue

    # Comparar consoantes da palavra vs IPA
    # Se as consoantes diferem, o TTS pode ler errado
    word_cons = re.sub(r'[aeiouãõâêîôûáéíóúàèìòùAEIOUÃÕÂÊÎÔÛÁÉÍÓÚÀÈÌÒÙ\sˈˌː˜.]', '', word)
    ipa_cons = re.sub(r'[aeiouãõâêîôûáéíóúàèìòùAEIOUÃÕÂÊÎÔÛÁÉÍÓÚÀÈÌÒÙ\sˈˌː˜.˥˦˧˨˩ʇ̃]', '', ipa)

    # Mapa IPA consoantes → PT-BR
    ipa_map = {
        'ʃ': 'x', 'ʒ': 'j', 'ɲ': 'nh', 'ʎ': 'lh',
        'ɾ': 'r', 'R': 'rr', 'ŋ': 'ng', 'w': 'u', 'j': 'i',
        'θ': '', 'ð': '', 'ɾ̃': '', 'dʒ': 'j', 'tʃ': 'x',
    }

    mapped_cons = ipa_cons
    for ipa_c, pt_c in ipa_map.items():
        mapped_cons = mapped_cons.replace(ipa_c, pt_c)

    # Se consoantes mapeadas diferem das consoantes da palavra
    if word_cons != mapped_cons and len(mapped_cons) > 0:
        # Gerar pronúncia aproximada
        pron = ipa
        pron = re.sub(r'[ˈˌː˜˥˦˧˨˩ʇ̃]', '', pron)
        pron = pron.replace('ʃ', 'x').replace('ʒ', 'j').replace('ɲ', 'nh')
        pron = pron.replace('ʎ', 'lh').replace('ɾ', 'r').replace('R', 'rr')
        pron = pron.replace('ŋ', 'ng').replace('w', 'u').replace('j', 'j')
        pron = pron.replace('dʒ', 'j').replace('tʃ', 'x')
        pron = pron.replace('.', ' ').strip()

        if pron and pron.lower() != word.lower() and len(pron) > 1:
            problematic[word] = pron

print(f"Total com espeak: {len(problematic)}")

# ============================================================
# 5. FILTRAR
# ============================================================
useful = dict()
for word, pron in problematic.items():
    if word.lower() != pron.lower():
        useful[word] = pron

print(f"Entradas úteis: {len(useful)}")

# ============================================================
# 6. SALVAR JSON
# ============================================================
json_path = '/home/z/my-project/vozpro-source/scripts/dict-ptbr.json'
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(dict(useful), f, ensure_ascii=False, indent=2)
print(f"\nJSON salvo: {json_path}")

# Separar manuais das automáticas
auto_entries = {w: p for w, p in useful.items() if w not in MANUAL}
print(f"Novas descobertas do espeak: {len(auto_entries)}")

print("\n=== NOVAS DESCOBERTAS (espeak) ===")
for word, pron in list(auto_entries.items())[:50]:
    print(f"  '{word}': '{pron}',")

print(f"\n✅ TOTAL FINAL: {len(useful)} entradas de correção")
