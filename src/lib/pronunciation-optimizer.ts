/**
 * Pronunciation Optimizer — Pipeline completo de pronúncia PT-BR para TTS
 *
 * Camada 1: Regex expandido (0ms de latência)
 * Camada 2: Dicionário de palavras problemáticas (0ms)
 * Camada 3: LLM fallback (1-3s, só quando necessário)
 *
 * Substitui a função optimizePronunciation() inline do page.tsx.
 * Usa colchetes [pronúncia] nativos do VozPro e troca de pontuação
 * para controlar prosódia.
 */

import { parseSSML, containsSSML, type TTSEngine } from './ssml-parser'

// ============================================================
// NÚMEROS POR EXTENSO (0 até bilhões)
// ============================================================

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/**
 * Converte número inteiro (0-999.999.999) para palavras em PT-BR.
 */
export function numberToWords(n: number): string {
  if (n === 0) return 'zero'
  if (n < 0) return 'menos ' + numberToWords(-n)
  if (n > 999999999) return String(n) // fora do alcance

  const parts: string[] = []

  // Milhões
  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000)
    parts.push(millions === 1 ? 'um milhão' : numberToWords(millions) + ' milhões')
    n %= 1000000
  }

  // Milhares
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000)
    if (thousands === 1) {
      parts.push('mil')
    } else {
      parts.push(numberToWords(thousands) + ' mil')
    }
    n %= 1000
  }

  // Centenas
  if (n >= 100) {
    if (n === 100) {
      parts.push('cem')
    } else {
      parts.push(HUNDREDS[Math.floor(n / 100)])
    }
    n %= 100
  }

  // Dezenas e unidades
  if (n >= 20) {
    const t = Math.floor(n / 10)
    const u = n % 10
    if (u === 0) {
      parts.push(TENS[t])
    } else {
      parts.push(TENS[t] + ' e ' + UNITS[u])
    }
  } else if (n >= 10) {
    parts.push(TEENS[n - 10])
  } else if (n > 0) {
    parts.push(UNITS[n])
  }

  return parts.join(' e ')
}

/** Converte valor monetário para palavras: "1.599,90" → "mil quinhentos e noventa e nove reais e noventa centavos" */
export function currencyToWords(val: string): string {
  const clean = val.replace(/\./g, '').replace(',', '.')
  const num = parseFloat(clean)
  if (isNaN(num)) return val

  if (num === 1) return 'um real'
  if (num < 0.01) return 'zero reais'

  const reais = Math.floor(num)
  const centavos = Math.round((num - reais) * 100)
  let result = ''

  if (reais > 0) {
    result = reais === 1 ? 'um real' : numberToWords(reais) + ' reais'
  }
  if (centavos > 0) {
    if (result) result += ' e '
    result += centavos === 1 ? 'um centavo' : numberToWords(centavos) + ' centavos'
  }

  return result || 'zero reais'
}

// ============================================================
// DICIONÁRIO DE PRONÚNCIA PT-BR
// ============================================================

/**
 * Palavras que o VozPro/F5-TTS frequentemente pronuncia errado em PT-BR.
 * Formato: palavra_original → pronúncia_correta
 *
 * O TTS tende a:
 * - Ler siglas como palavras ("DVD" → "davide" em vez de "dê vê dê")
 * - Pronunciar estrangeirismos com sotaque inglês ("marketing" → "márketing")
 * - Ler abreviações literalmente ("Av." → "ave" em vez de "avenida")
 * - Confundir homógrafos ("segundo" tempo vs "segundo" número)
 */
const PRONUNCIATION_DICTIONARY: Record<string, string> = {
  // === SIGLAS / ACRÔNIMOS (soletrar) ===
  'API': 'a p i',
  'DVD': 'dê vê dê',
  'GPS': 'gê pê és',
  'IPTU': 'i pê tê u',
  'INSS': 'i êne és és',
  'URL': 'u erre éle',
  'PDF': 'pê dê éfe',
  'HTML': 'agá tê ême éle',
  'CSS': 'cê és és',
  'CRM': 'cê erre ême',
  'CNPJ': 'cê êne pê jota',
  'CPF': 'cê pê éfe',
  'RG': 'erre gê',
  'IMC': 'i ême cê',
  'DVDs': 'dê vê dês',
  'CEP': 'cê ê pê',
  'CNPJs': 'cê êne pê jotas',
  'CPFs': 'cê pê és',
  'PIB': 'pê i bê',
  'PIBC': 'pê i bê cê',
  'SUV': 'ês u vê',
  'IBGE': 'i bê gê i',
  'PNG': 'pê êne gê',
  'JPG': 'jota pê gê',
  'GIF': 'gife',
  'USB': 'u és bê',
  'Wi-Fi': 'uái fái',
  'wifi': 'uái fái',
  'WiFi': 'uái fái',
  '3D': 'três dê',
  '4D': 'quatro dê',
  '5G': 'quinto gê',
  '4G': 'quarto gê',
  'HD': 'agá dê',
  'SSD': 'ês és dê',

  // === PALAVRAS EM INGLÊS COMUNS EM TEXTOS PT/EN ===
  // O TTS tenta pronunciar com fonética PT ("Hello" → "Élho", "Thank" → "Tánque")
  // Apenas palavras que NÃO existem em português para não conflitar
  // ATENÇÃO: Não adicionar palavras como "no", "come", "like", "use", "test", "just"
  // pois elas existem em PT e o dicionário usaria a pronúncia EN mesmo em texto PT puro
  'hello': 'relou',
  'Hello': 'Relou',
  'HELLO': 'RELOU',
  'hi': 'rai',
  'Hi': 'Rai',
  'thank': 'fénque',
  'Thank': 'Fénque',
  'thanks': 'fénques',
  'Thanks': 'Fénques',
  'you': 'iu',
  'You': 'Iu',
  'your': 'iór',
  'Your': 'Iór',
  'welcome': 'uéquen',
  'Welcome': 'Uéquen',
  'please': 'plíiz',
  'Please': 'Plíiz',
  'sorry': 'sóri',
  'Sorry': 'Sóri',
  'yes': 'yés',
  'Yes': 'Yés',
  'bye': 'bai',
  'Bye': 'Bai',
  'goodbye': 'gudebai',
  'Goodbye': 'Gudebai',
  'good': 'gude',
  'Good': 'Gude',
  'morning': 'mórningue',
  'Morning': 'Mórningue',
  'night': 'náiite',
  'Night': 'Náiite',
  'beautiful': 'biutifol',
  'Beautiful': 'Biutifol',
  'voice': 'vóise',
  'Voice': 'Vóise',
  'artificial': 'artifícial',
  'Artificial': 'Artifícial',
  'intelligence': 'intélidjens',
  'Intelligence': 'Intélidjens',
  'clearly': 'clíarli',
  'Clearly': 'Clíarli',
  'speaking': 'spíkingue',
  'Speaking': 'Spíkingue',
  'speech': 'spítch',
  'Speech': 'Spítch',
  'pronunciation': 'pronansieichon',
  'Pronunciation': 'Pronansieichon',
  'rhythm': 'rídem',
  'Rhythm': 'Rídem',
  'today': 'tudéi',
  'Today': 'Tudéi',
  'climate': 'cláimite',
  'Climate': 'Cláimite',
  'listen': 'lísene',
  'Listen': 'Lísene',
  'hear': 'riar',
  'Hear': 'Riar',
  'this': 'dís',
  'This': 'Dís',
  'that': 'dét',
  'That': 'Dét',
  'what': 'uót',
  'What': 'Uót',
  'the': 'de',
  'The': 'De',
  'they': 'dêi',
  'They': 'Dêi',
  'their': 'dérre',
  'Their': 'Dérre',
  'them': 'dème',
  'Them': 'Dème',
  'these': 'díise',
  'These': 'Díise',
  'those': 'dôuse',
  'Those': 'Dôuse',
  'will': 'uíle',
  'Will': 'Uíle',
  'would': 'úude',
  'Would': 'Úude',
  'could': 'cúde',
  'Could': 'Cúde',
  'should': 'chúde',
  'Should': 'Chúde',
  'been': 'bín',
  'Been': 'Bín',
  'were': 'uér',
  'Were': 'Uér',
  'was': 'uóze',
  'Was': 'Uóze',
  'have': 'réve',
  'Have': 'Réve',
  'has': 'réze',
  'Has': 'Réze',
  'with': 'uíde',
  'With': 'Uíde',
  'from': 'fróme',
  'From': 'Fróme',
  'not': 'nóte',
  'Not': 'Nóte',
  'but': 'báde',
  'But': 'Báde',
  'also': 'ólsou',
  'Also': 'Ólsou',
  'only': 'óunli',
  'Only': 'Óunli',
  'even': 'ívene',
  'Even': 'Ívene',
  'still': 'estíle',
  'Still': 'Estíle',
  'over': 'óuver',
  'Over': 'Óuver',
  'after': 'éftere',
  'After': 'Éftere',
  'before': 'bifórre',
  'Before': 'Bifórre',
  'between': 'bituíine',
  'Between': 'Bituíine',
  'under': 'ânderre',
  'Under': 'Ânderre',
  'never': 'néverre',
  'Never': 'Néverre',
  'always': 'ólueize',
  'Always': 'Ólueize',
  'every': 'évri',
  'Every': 'Évri',
  'very': 'véri',
  'Very': 'Véri',
  'now': 'náu',
  'Now': 'Náu',
  'one': 'uâne',
  'One': 'Uâne',
  'two': 'túu',
  'Two': 'Túu',
  'three': 'fríi',
  'Three': 'Fríi',
  'four': 'fórr',
  'Four': 'Fórr',
  'five': 'fáiive',
  'Five': 'Fáiive',
  'six': 'sícs',
  'Six': 'Sícs',
  'seven': 'sévene',
  'Seven': 'Sévene',
  'eight': 'êite',
  'Eight': 'Êite',
  'nine': 'náine',
  'Nine': 'Náine',
  'ten': 'ténne',
  'Ten': 'Ténne',
  'world': 'uórrede',
  'World': 'Uórrede',
  'people': 'pípou',
  'People': 'Pípou',
  'new': 'niuu',
  'New': 'Niuu',
  'time': 'táime',
  'Time': 'Táime',
  'way': 'uêi',
  'Way': 'Uêi',
  'know': 'nóu',
  'Know': 'Nóu',
  'think': 'fínque',
  'Think': 'Fínque',
  'find': 'fáiinde',
  'Find': 'Fáiinde',
  'give': 'gíive',
  'Give': 'Gíive',
  'tell': 'télle',
  'Tell': 'Télle',
  'work': 'uórque',
  'Work': 'Uórque',
  'need': 'níide',
  'Need': 'Níide',
  'try': 'trái',
  'Try': 'Trái',
  'look': 'luque',
  'Look': 'Luque',
  'different': 'díferente',
  'Different': 'Díferente',
  'important': 'impórtante',
  'Important': 'Impórtante',

  // === ESTRANGEIRISMOS COMUNS (pronúncia aportuguesada) ===
  'marketing': 'marqueting',
  'Marketing': 'Marqueting',
  'MARKETING': 'MARQUETING',
  'download': 'daunloud',
  'Download': 'Daunloud',
  'upload': 'aploud',
  'Upload': 'Aploud',
  'software': 'softeuér',
  'Software': 'Softeuér',
  'hardware': 'ardeuér',
  'Hardware': 'Ardeuér',
  'mouse': 'mause',
  'Mouse': 'Mause',
  'link': 'linque',
  'Link': 'Linque',
  'links': 'linques',
  'Links': 'Linques',

  'logout': 'logoúte',
  'Logout': 'Logoúte',
  'online': 'onlaine',
  'Online': 'Onlaine',
  'offline': 'offlaine',
  'Offline': 'Offlaine',
  'browser': 'brauzér',
  'Browser': 'Brauzér',
  'app': 'épe',
  'App': 'Épe',
  'apps': 'épes',
  'Apps': 'Épes',
  'startup': 'startape',
  'Startup': 'Startape',
  'feedback': 'fidebáque',
  'Feedback': 'Fidebáque',
  'layout': 'leiáute',
  'Layout': 'Leiáute',
  'design': 'dizaine',
  'Design': 'Dizaine',
  'sprint': 'esprinte',
  'Sprint': 'Esprinte',
  'benchmark': 'benchmarque',
  'Benchmark': 'Benchmarque',
  'hacker': 'râquer',
  'Hacker': 'Râquer',
  'podcast': 'podcáste',
  'Podcast': 'Podcáste',
  'vlog': 'vlogue',
  'Vlog': 'Vlogue',
  'blog': 'blogue',
  'Blog': 'Blogue',
  'e-commerce': 'comércio eletrônico',
  'e-mail': 'imeil',
  'email': 'imeil',
  'E-mail': 'Imeil',
  'site': 'sáite',
  'Site': 'Sáite',
  'smartphone': 'smartifone',
  'Smartphone': 'Smartifone',

  'hashtag': 'rastague',
  'Hashtag': 'Rastague',
  'influencer': 'influenser',
  'Influencer': 'Influenser',
  'live': 'laive',
  'Live': 'Laive',
  'streaming': 'estrimingue',
  'Streaming': 'Estrimgue',
  'know-how': 'nou rau',
  'showroom': 'chorume', // aportuguesado
  'background': 'bécigraunde',
  'framework': 'freimeuorquê',
  'office': 'ófice',
  'Office': 'Ófice',
  'business': 'biznise',
  'performance': 'perfománsse',
  'standard': 'stándarde',
  'ranking': 'ranquingue',
  'tester': 'téster',
  'manager': 'manájer',
  'partner': 'pártenér',
  'delivery': 'delivéri',
  'coffee': 'cófi',
  'break': 'breique',
  'meeting': 'mitingue',

  'home': 'roume',
  'upgrade': 'apgreide',
  'downgrade': 'daungreide',
  'backup': 'bécape',
  'chip': 'tchip',
  'byte': 'baite',
  'pixel': 'píxél',
  'click': 'clique',
  'touch': 'tatx',
  'display': 'displei',
  'storage': 'estorage',
  'server': 'servér',
  'router': 'raúter',
  'switch': 'suitx',
  'patch': 'pétch',
  'hug': 'rague',
  'spray': 'espréi',
  'sticker': 'stiquér',
  'flag': 'flague',
  'kit': 'quité',
  'Premium': 'Prêmium',
  'premium': 'prêmium',
  'VIP': 'vipe',
  'vip': 'vipe',
  'outlet': 'aulete',
  'smart': 'smarte',
  'factory': 'fáctore',
  'outdoor': 'aútedor',
  'drive-thru': 'draive tru',
  'play': 'plei',
  'stop': 'stope',
  'start': 'starte',
  'fast': 'fáste',
  'food': 'fude',
  'center': 'senter',
  'shopping': 'choping',
  'fitness': 'fitnes',
  'personal': 'perssonal',
  'trainer': 'treiner',
  'crossfit': 'crosfite',
  'boot': 'bute',
  'bootcamp': 'butecampe',
  'coding': 'codingue',
  'debug': 'dibague',
  'deploy': 'diploy',
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
  'hype': 'raipe',
  'geek': 'guique',
  'nerd': 'nerde',
  'pop': 'pope',
  'rock': 'roque',
  'jazz': 'jázze',
  'blues': 'blúze',
  'remix': 'remixe',
  'featuring': 'fiuturinge',
  'rapper': 'reper',
  'gameplay': 'gemeplei',
  'gameover': 'geme ouver',
  'e-sports': 'isportes',
  'esports': 'isportes',
  'score': 'escóre',
  'goal': 'gole',
  'penalti': 'penalte',
  'shoot': 'chute',
  'match': 'metxe',
  'round': 'raunde',
  'set': 'sete',

  // === ABREVIAÇÕES (expandir) ===
  'Sr.': 'Senhor',
  'Sra.': 'Senhora',
  'Srta.': 'Senhorita',
  'Dr.': 'Doutor',
  'Dra.': 'Doutora',
  'Prof.': 'Professor',
  'Profa.': 'Professora',
  'Gov.': 'Governador',
  'Govª.': 'Governadora',
  'Av.': 'Avenida',
  'R.': 'Rua',
  'Pça.': 'Praça',
  'Ltda.': 'Limitada',
  'S/A': 'Sociedade Anônima',
  'MEI': 'Microempreendedor Individual',
  'ME': 'Microempresa',
  'EPP': 'Empresa de Pequeno Porte',
  'Vol.': 'Volume',
  'Cap.': 'Capítulo',
  'Pág.': 'Página',
  'Tel.': 'Telefone',
  'Ref.': 'Referência',
  'Obs.': 'Observação',
  'Exmo.': 'Excelentíssimo',
  'Exma.': 'Excelentíssima',
  'Ilmo.': 'Ilustríssimo',
  'Ilma.': 'Ilustríssima',
  'V.Exa.': 'Vossa Excelência',
  'V.Sa.': 'Vossa Senhoria',
  'Att.': 'Atenciosamente',
  'Cia.': 'Companhia',
  'Deptº': 'Departamento',
  'Min.': 'Ministro',
  'Maj.': 'Major',
  'Cel.': 'Coronel',
  'Gen.': 'General',
  'Emb.': 'Embaixador',

  // === PALAVRAS PROBLEMÁTICAS ESPECÍFICAS DO TTS ===
  // O VozPro/F5-TTS frequentemente pronuncia estas errado
  // === GN INICIAL — fonética: GN → "guin" em PT-BR ===
  'gnomo': 'guinômo',
  'Gnomo': 'Guinômo',
  'gnomos': 'guinômos',
  'Gnomos': 'Guinômos',
  'gnóstica': 'guinóstica',
  'Gnóstica': 'Guinóstica',
  'gnósticas': 'guinósticas',
  'gnóstico': 'guinóstico',
  'Gnóstico': 'Guinóstico',
  'gnósticos': 'guinósticos',
  'gnose': 'guinose',
  'Gnose': 'Guinose',
  'gnosticismo': 'guinosticismo',
  'Gnosticismo': 'Guinosticismo',

  // === PS INICIAL — REMOVIDO ===
  // O TTS lê "s" como "z" entre vogais (pisicólogo→pizicólogo)
  // Melhor deixar o TTS falar a palavra original "psicólogo" naturalmente
  // psicólogo, pseudo, psiquiatra, etc. — sem entrada no dicionário

  // === PN INICIAL — fonética: PN → "pineu" em PT-BR ===
  'pneumologia': 'pineumologia',
  'Pneumologia': 'Pineumologia',
  'pneumônico': 'pineumônico',
  'Pneumônico': 'Pineumônico',
  'pneumonia': 'pineumonia',
  'Pneumonia': 'Pineumonia',
  'pneumotórax': 'pineumotórax',
  'pneumático': 'pineumático',
  'Pneumático': 'Pineumático',
  'pneumococo': 'pineumococo',
  'pneu': 'pineu',
  'Pneu': 'Pineu',
  'pneus': 'pineus',
  'Pneus': 'Pineus',

  // === MN INICIAL — fonética: MN → "mineu" em PT-BR ===
  'mnemônico': 'mineumônico',
  'Mnemônico': 'Mineumônico',
  'mnemônica': 'mineumônica',
  'Mnemônica': 'Mineumônica',
  'mnemônese': 'mineumônese',

  // === PT INICIAL ===
  'ptialismo': 'petialismo',
  'Ptialismo': 'Petialismo',
  'ptose': 'petose',
  'cpt': 'cê pê tê',
  'CPT': 'cê pê tê',

  // H MUDO — AGORA COBERTO POR REGEX 1d AUTOMÁTICA
  // A regex h([aeiouáàãâéèêíïóôõúü]) remove H no início de TODAS as palavras
  // hoje, Hoje, hora, Hora, homem, Homem, hotel, Hotel, hierarquia, Hierarquia,
  // hernia, Hérnia, habilidade, história, História, herança, Herança,
  // hidráulico, Hidráulico, humor, Umor, homicídio, Omicídio, hipertensão,
  // hemodiálise, honesto, horizonte, hexadecimal, helicóptero, harmonia, etc.
  // Não precisa mais de entrada individual — a regex cobre todas

  // === PALAVRAS COMUNS QUE O TTS ERRA ===

  // Palavras com som de X que não são cobertas pelo dicionário X

  // Palavras com ge/gi inverter para J quando TTS lê G duro

  // quente, questão, química, quinto — removidos (no-op, TTS já pronuncia correto)

  // Verbos e palavras comuns com pronúncia não-óbvia
  'sugestão': 'sujestão',
  'Sugestão': 'Sujestão',
  'sugestões': 'sujestões',
  'digestão': 'dijestão',
  'Digestão': 'Dijestão',
  'gestão': 'jestão',
  'Gestão': 'Jestão',

  // Ciência e termos comuns

  // Outras correções comuns
  'xícara': 'chícara',
  'Xícara': 'Chícara',
  // === H MUDO — palavras mais comuns como garantia ===
  // A regex 1d cobre todas, mas essas entradas garantem que funcionem
  // Importante: minúsculo! TTS lê maiúscula como nome próprio e inventa H
  'hoje': 'oje',
  'Hoje': 'oje',
  'homem': 'omem',
  'Homem': 'omem',
  'honesto': 'onesto',
  'Honesto': 'onesto',
  'higiene': 'igiene',
  'Higiene': 'igiene',

  'xingar': 'chingar',
  'xingamento': 'chingamento',
  'lapso': 'lápisso',
  'Lapso': 'Lápisso',

  // === NOMES PRÓPRIOS DIFÍCEIS ===
  'Wolski': 'Uíski',
  'Kowalski': 'Covalsqui',
  'Higashi': 'Rigaxi',
  'Schütz': 'Xuts',


  'Yngrid': 'Ingrid',
  "L'Oréal": 'Loreal',

  // === MARCAS / NEGÓCIOS (expansão Fase 1) ===
  'Carrefour': 'Carrefur',


  'Apple': 'Épel',
  'Microsoft': 'Maicrósofte',
  'Amazon': 'Amazônia',
  'Magazine Luiza': 'Magazine Luíza',


  'C&A': 'Cê e Á',
  'HP': 'Agá Pê',
  'Dell': 'Del',
  'IBM': 'I Agá Bê Emme',
  'AMD': 'A Éme Dê',
  'Foxconn': 'Focsone',
  'Airbnb': 'Ér en bi en bi',
  'iFood': 'i fude',
  'Nubank': 'Nubanke',
  'PicPay': 'PicPei',
  'Renner': 'Réner',
  'Herbalife': 'Erbaife',
  'Avon': 'Avone',
  'ODONTOPREV': 'Odôntoprêve',
  'UNIMED': 'Unimede',

  'Bradesco': 'Bradésco',


  'Renault': 'Renô',
  'Fiat': 'Fiate',
  'Chevrolet': 'Chevrólet',
  'Volkswagen': 'Folquesvágue',

  'Hyundai': 'Rundai',
  'Peugeot': 'Pejô',
  'Citroën': 'Citroen',
  'Jeep': 'Jipe',
  'Land Rover': 'Lande Rover',

  // === TECNOLOGIA (expansão Fase 1) ===
  'TikTok': 'TíTóque',


  'Discord': 'Discorde',

  'Skype': 'Scaipe',

  'Twitch': 'Tuitx',

  'LG': 'Éle Gê',


  'Brother': 'Bráder',
  'JBL': 'Jota Bê Éle',
  'Logitech': 'Lodjiteque',
  'Razer': 'Réizer',
  'Corsair': 'Corsér',
  'Bluetooth': 'Blutuuce',
  'Ethernet': 'Érnet',
  'QR Code': 'quér code',


  'Windows': 'Uíndeus',

  'iOS': 'i O S',
  'SQL': 'S Q L',

  // === SAÚDE / MEDICAMENTOS (expansão Fase 1) ===
  // REMOVIDAS instruções [fonema] — VozPro lia literalmente e falava errado
  // ex: colesterol era [colesteróle] e o TTS falava "colesteróle"
  // hipertensão → coberta pela regex H mudo (h+vogal → vogal) — não precisa de entrada
  'AVC': 'A V Cê',
  'HIV': 'H I V',
  'omicrânio': 'omicron',
  'insuficiência renal': 'insuficiência renal',

  // === ALIMENTAÇÃO (expansão Fase 1) ===
  'açaí': 'assai',


  'paçoca': 'passoca',


  // === GERAL / OUTROS (expansão Fase 1) ===
  'QR code': 'cúder code',
  'CEO': 'cê e i ó',
  'CFO': 'cê éfe ó',
  'CTO': 'cê tê ó',
  'RH': 'erre águe',
  'PK': 'pê cá',
  'NGO': 'ênge ô',
  'GPT': 'gê pê tê',
  'LLM': 'éle éleême',
  'SSR': 'és és ér',
  'VPN': 'vê pê éne',
  'LAN': 'éle águe éne',
  'RAM': 'erre águe éme',
  'ROM': 'erre ó éme',
  'BI': 'bê i',
  'DB': 'dê bê',
  'SaaS': 'sáce',
  'IoT': 'i ó tê',
  'B2B': 'bê dois bê',
  'B2C': 'bê dois cê',
  'freelancer': 'frilenser',
  'stackoverflow': 'stack ouverflou',
  'github': 'giteube',
  'GitHub': 'Giteube',
  'reddit': 'rédite',
  'screenshot': 'screnshote',
  'shareware': 'xérueér',
  'open-source': 'ópen sourse',
  'docker': 'dóquer',
  'kubernetes': 'kubernétes',
  'wordpress': 'uórdpress',
  'woocommerce': 'uócomérce',
  'shopify': 'xópifei',
  'chatbot': 'chatebote',
  'IA': 'i á',
  'PC': 'pê cê',
  'TV': 'tê vê',
  'CNPJ': 'cê ene pê jota',
  'CPF': 'cê pê éfe',
  'PIS': 'pê i esse',
  'PASEP': 'pá sêpe',
  'FGTS': 'éfe gê tê esse',
  'INSS': 'i éne esse esse',
  'IRPF': 'i erre pê éfe',
  'IRPJ': 'i erre pê jota',
  'ICMS': 'i cê éme esse',
  'ISSQN': 'i esse esse quê éne',
  'SIMPLES': 'símples',
  'NF-e': 'éne éfe e',
  'CT-e': 'cê tê e',
  'MDF-e': 'éme dê éfe e',
  'SPED': 'és pê éde',
  'eSocial': 'e sôcial',
  'REINT': 'reínte',
  'DCTF': 'dê cê tê éfe',
  'ECF': 'é cê éfe',
  'CNH': 'cê erne águe',
  'DPVAT': 'dê pê vê á tê',
  'IPVA': 'i pê vê á',
  'ITBI': 'i tê bê i',
  'IPTU': 'i pê tê u',

  // === JURÍDICO / LEGAL ===

  'STF': 'és tê éfe',
  'STJ': 'és tê jota',
  'TJ': 'tê jota',
  'TRF': 'tê erre éfe',
  'TSE': 'tê és e',
  'TRE': 'tê erre e',
  'MP': 'ême pê',
  'MPT': 'ême pê tê',
  'MPU': 'ême pê u',
  'CPP': 'cê pê pê',
  'CLT': 'cê éle tê',
  'CPC': 'cê pê cê',
  'CTN': 'cê tê êne',
  'CF': 'cê éfe',
  'CP': 'cê pê',
  'OAB': 'ô a bê',
  'ADIn': 'a dê in',
  'ADI': 'a dê i',
  'MS': 'ême és',
  'HC': 'agá cê',
  'REsp': 'erre és pê',
  'AREsp': 'á erre és pê',
  'AgRg': 'a gê erre gê',
  'EDcl': 'é dê cê éle',
  'EI': 'e i',
  'IRDR': 'i erre dê erre',
  'RTJ': 'erre tê jota',
  'RTF': 'erre tê éfe',
  'RJTJE': 'erre jota tê jota i',


  // === FINANCEIRO / ECONOMIA ===
  'BCB': 'bê cê bê',
  'CDI': 'cê dê i',
  'Selic': 'Sélique',
  'SELIC': 'Sélique',
  'IPCA': 'i pê cê a',
  'IGP-M': 'i gê pê mês',
  'INPC': 'i êne pê cê',
  'TR': 'tê erre',
  'CDB': 'cê dê bê',
  'RDB': 'erre dê bê',
  'LCA': 'éle cê a',
  'LCI': 'éle cê i',
  'CRI': 'cê erre i',
  'CRA': 'cê erre a',
  'LCI/LCA': 'éle cê i éle cê a',

  'FII': 'éfe i i',
  'FIDC': 'éfe i dê cê',
  'ETF': 'i tê éfe',
  'Hedge': 'rédge',
  'hedge': 'rédge',
  'Swap': 'suáp',
  'swap': 'suáp',


  'DRE': 'dê erre e',
  'EBITDA': 'ebitida',
  'ROI': 'erre ó i',
  'ROE': 'erre ó e',
  'ROA': 'erre ó a',
  'EBIT': 'e bê i tê',
  'CAPEX': 'cápex',
  'OPEX': 'óplex',
  'Payback': 'peibáque',
  'payback': 'peibáque',
  'Cash flow': 'caxe flou',
  'Breakeven': 'breiqueven',
  'breakeven': 'breiqueven',
  'Spread': 'espréde',
  'spread': 'espréde',
  'Compliance': 'compláience',
  'compliance': 'compláience',
  'Due diligence': 'du diligence',
  'Valuation': 'valuação',
  'valuation': 'valuação',
  'Benchmarking': 'benchmárquingue',
  'benchmarking': 'benchmárquingue',
  'KPI': 'cê pê i',
  'OKR': 'ó cê erre',
  'SLA': 'és éle a',
  'NPS': 'ême pê és',
  'CAGR': 'cáge arre',
  'LTV': 'éle tê vê',

  // === EDUCAÇÃO ===
  'ENEM': 'é nê éme',
  'UNB': 'unê bê',
  'USP': 'u és pê',
  'UFRJ': 'u éfe erre jota',
  'UFMG': 'u éfe éme gê',
  'UFSC': 'u éfe és cê',
  'UFRGS': 'u éfe erre gê és',
  'UNICAMP': 'unicampe',
  'UNESP': 'unespe',
  'UTFPR': 'ute efê tê pê erre',
  'IFSP': 'i éfe és pê',
  'Pos-graduação': 'pós-graduação',


  'TCC': 'tê cê cê',


  'Campus': 'câmpus',
  'campus': 'câmpus',


  // === GOVERNO / ÓRGÃOS PÚBLICOS ===


  'ANP': 'a êne pê',
  'ANA': 'a êne a',
  'ANTT': 'a êne tê tê',
  'ANS': 'a êne és',
  'CVM': 'cê vê éme',
  'INPI': 'i êne pê i',

  'PF': 'pê éfe',
  'ABIN': 'abine',
  'CGU': 'cê gê u',
  'TCU': 'tê cê u',
  'TJSP': 'tê jota és pê',
  'TJRJ': 'tê jota erre jota',
  'TJMG': 'tê jota éme gê',
  'TRF1': 'tê erre éfe um',
  'TRF2': 'tê erre éfe dois',
  'TRF3': 'tê erre éfe três',
  'TRF4': 'tê erre éfe quatro',
  'TRF5': 'tê erre éfe cinco',
  'TRF6': 'tê erre éfe seis',
  'Carf': 'carfe',
  'CARF': 'carfe',
  'PGFN': 'pê gê éfe éne',
  'AGU': 'a gê u',
  'PGU': 'pê gê u',


  // === MAIS TECNOLOGIA ===
  'ChatGPT': 'Chat Gê Pê Tê',
  'GPT-4': 'gê pê tê quatro',
  'GPT-3': 'gê pê tê três',
  'OpenAI': 'Open AI',
  'Gemini': 'Gêmeine',
  'Copilot': 'Copailete',
  'Midjourney': 'Midjórnei',
  'Stable Diffusion': 'Steibol Difiújion',
  'Hugging Face': 'Raguein Feice',
  'Gradio': 'Grádio',
  'PyTorch': 'Páitorche',
  'TensorFlow': 'Ténsorflou',
  'Flutter': 'Fláuter',
  'Dart': 'Darte',
  'Kotlin': 'Cótline',
  'Swift': 'Suíte',
  'Rust': 'Raste',
  'Go': 'Gó',
  'MongoDB': 'Mongó DB',
  'Redis': 'Rédise',
  'PostgreSQL': 'Postgres QL',
  'GraphQL': 'Graph QL',
  'REST': 'réste',
  'REST API': 'réste API',
  'WebSocket': 'Uébe Sócquete',
  'Nginx': 'Njinxe',
  'Jenkins': 'Jênquins',
  'GitLab': 'GitLabe',
  'Notion': 'Nócion',
  'Figma': 'Fígma',
  'Canva': 'Cánva',
  'Miro': 'Míro',
  'Trello': 'Trélo',
  'Asana': 'Azana',
  'Slack': 'Slace',
  'Basecamp': 'Beisecâmpe',
  'Vercel': 'Versel',
  'Supabase': 'Supabeise',
  'Firebase': 'Faíberbeise',
  'Heroku': 'Herócue',
  'DigitalOcean': 'Digital Océan',
  'AWS': 'a dabliu és',
  'GCP': 'gê cê pê',
  'Azure': 'ézurre',

  // === MAIS MARCAS BRASILEIRAS ===
  'Shopee': 'Xópi',
  'OLX': 'ó éle ixe',
  'Rappi': 'Rapi',
  '99': 'noventa e nove',
  'Stone': 'Istóne',
  'PagSeguro': 'Pague Seguro',
  'Cielo': 'Siélo',
  'Getnet': 'Guetnete',
  'Elavon': 'Elavóne',
  'Adyen': 'Aidéne',
  'Stripe': 'Estraípe',
  'Wise': 'Uáize',
  'Nomad': 'Nômade',
  'C6 Bank': 'Cê Seis Bank',
  'BTG Pactual': 'Bê Tê Gê Pactual',
  'Clear': 'Clír',
  'Modal': 'Módau',
  'Easynvest': 'Easinvést',


  'Conductor': 'Condutor',
  'Wirecard': 'Uáiarcárde',
  'Moip': 'Móipe',
  'PayPal': 'Pei Pei El',
  'Bitcoin': 'Bicoine',
  'Ethereum': 'Ethereúme',
  'Litecoin': 'Láitecoine',
  'USDT': 'u és dê tê',
  'Stablecoin': 'Steibolcoine',
  'Blockchain': 'Blocqueine',
  'Web3': 'Uébe três',

  'NFT': 'éne éfe tê',

  // === MAIS SAÚDE / MEDICAMENTOS ===


  'vitamina D': 'vitamina dê',
  'vitamina B12': 'vitamina bê doze',
  'vitamina C': 'vitamina cê',


  'TSH': 'tê és agá',
  'T4 livre': 'tê quatro livre',
  'PSA': 'pê és a',
  'PCR': 'pê cê erre',
  'RAFA': 'arre a éfe a',
  'VHS': 'vê agá és',
  'PCR COVID': 'pê cê erre côvide',


  'IgG': 'i gê gê',
  'IgM': 'i gê éme',
  'IgA': 'i gê a',


  'TPA': 'tê pê a',
  'INR': 'i êne erre',
  'aPTT': 'a pê tê tê',
  'D-dímero': 'dê dímero',
  'CK-MB': 'cê cáême bê',
  'BNP': 'bê êne pê',
  'proBNP': 'pró bê êne pê',


  'swab': 'suabe',
}

// ============================================================
// PRÉ-PROCESSADOR DE X — 6 sons contextuais
// ============================================================

/**
 * Dicionário de palavras com X que o TTS pronuncia errado.
 * Mapeia a palavra completa para a versão com pronúncia correta.
 *
 * O X em português tem 6 sons possíveis:
 * - KS: táxi, sexo, complexo, perplexo, têxtil, axila, sintaxe
 * - CH: xarope, xaxim, xadrez, xampu, enxada, enxame, peixada, baixar
 * - Z: exército, exemplo, exercício, existir, exílio, exigir, exame
 * - SS: México, vexame, mexer, mexicano
 * - S: extensão, explicar, exportar, expressão, extraordinário
 * - Z (pós-vogal): exílio, existir, exótico
 */
const X_WORD_DICTIONARY: Record<string, string> = {
  // X = CH (som de "ch")
  'xarope': 'charópe',
  'Xarope': 'Charópe',
  'xaxim': 'chachim',
  'Xaxim': 'Chachim',
  'xadrez': 'chadrez',
  'Xadrez': 'Chadrez',
  'xampu': 'champu',
  'Xampu': 'Champu',
  'xavante': 'chavante',
  'Xavante': 'Chavante',
  'enxada': 'enchada',
  'enxame': 'enchame',
  'enxoval': 'enchoval',
  'enxaqueca': 'enchaqueca',
  'enxuto': 'enchuto',
  'peixada': 'peichada',
  'Peixada': 'Peichada',
  'peixe': 'peiche',
  'Peixe': 'Peiche',
  'baixar': 'baichar',
  'Baixar': 'Baichar',
  'baixo': 'baicho',
  'Baixo': 'Baicho',
  'baixa': 'baicha',
  'Baixa': 'Baicha',
  'caxinguelê': 'cachinguelê',
  'relaxar': 'relachar',
  'Relaxar': 'Relachar',
  'relaxamento': 'relachamento',
  'Relaxamento': 'Relachamento',
  'axila': 'achila',
  'Axila': 'Achila',

  // X = Z (som de "z" — ex- antes de vogal)
  'exército': 'ezército',
  'Exército': 'Ezército',
  'exemplo': 'ezemplo',
  'Exemplo': 'Ezemplo',
  'exercício': 'ezercício',
  'Exercício': 'Ezercício',
  'exigir': 'ezigir',
  'Exigir': 'Ezigir',
  'exílio': 'ezílio',
  'Exílio': 'Ezílio',
  'existir': 'ezistir',
  'Existir': 'Ezistir',
  'exame': 'ezame',
  'Exame': 'Ezame',
  'exato': 'ezato',
  'Exato': 'Ezato',
  'exceção': 'ezeção',
  'Exceção': 'Ezeção',
  'excluir': 'ezcluir',
  'Excluir': 'Ezcluir',
  'executar': 'ezecutar',
  'Executar': 'Ezecutar',
  'exibir': 'ezibir',
  'Exibir': 'Ezibir',
  'exótico': 'ezótico',
  'Exótico': 'Ezótico',
  'expor': 'ezpor',
  'Expor': 'Ezpor',
  'extensão': 'estensão',
  'Extensão': 'Estensão',
  'explicar': 'esplicar',
  'Explicar': 'Esplicar',

  'expressão': 'espressão',
  'Expressão': 'Espressão',
  'extraordinário': 'estraordinário',
  'Extraordinário': 'Estraordinário',
  'extrato': 'estrato',
  'Extrato': 'Estrato',
  'experiência': 'esperiência',
  'Experiência': 'Esperiência',
  'expresso': 'espresso',
  'Expresso': 'Espresso',
  'explosão': 'esplosão',
  'Explosão': 'Esplosão',
  'explorar': 'esplorar',
  'Explorar': 'Esplorar',
  'exposição': 'esposição',
  'Exposição': 'Esposição',
  'explícito': 'esplicito',
  'Explícito': 'Esplicito',
  'expectativa': 'espectativa',
  'Expectativa': 'Espectativa',
  'exíguo': 'ezíguo',
  'Exíguo': 'Ezíguo',

  // X = SS (som de "ss")
  // NOTA: México em PT-BR é pronunciado "Méchico" (X = CH)
  'México': 'Méchico',
  'mexicano': 'mechicano',
  'Mexicano': 'Mechicano',
  'mexicana': 'mechicana',
  'Mexicana': 'Mechicana',
  'vexame': 'vessame',
  'Vexame': 'Vessame',
  'mexer': 'messer',
  'Mexer': 'Messer',
  'mexida': 'messida',
  'Mexida': 'Messida',

  // X = KS (som de "ks")
  'táxi': 'tácsi',
  'Táxi': 'Tácsi',
  'sexo': 'sékso',
  'Sexo': 'Sékso',
  'complexo': 'complekso',
  'Complexo': 'Complekso',
  'perplexo': 'perplekso',
  'Perplexo': 'Perplekso',
  'têxtil': 'têkstil',
  'Têxtil': 'Têkstil',
  'sintaxe': 'sintakse',
  'Sintaxe': 'Sintakse',
  'ortodoxo': 'ortodokso',
  'Ortodoxo': 'Ortodokso',
  'paradoxo': 'paradokso',
  'Paradoxo': 'Paradokso',
  'nexus': 'neksus',
  'fixo': 'fikso',
  'Fixo': 'Fikso',
  'fixar': 'fiksar',
  'Fixar': 'Fiksar',
  'maximizar': 'maksimizar',
  'Maximizar': 'Maksimizar',
  'máximo': 'máksimo',
  'Máximo': 'Máksimo',
  'taxa': 'taksa',
  'Taxa': 'Taksa',
  'oxigênio': 'oksijênio',
  'Oxigênio': 'Oksijênio',
  'tóxico': 'tóksico',
  'Tóxico': 'Tóksico',
  'toxina': 'toksina',
  'Toxina': 'Toksina',
  'intoxicação': 'intoksicação',
  'Intoxicação': 'Intoksicação',

  // Xangai — nome próprio, som de CH
}

/**
 * Pré-processa todas as ocorrências de X no texto,
 * substituindo palavras com X pela pronúncia correta.
 */
function preprocessX(text: string): string {
  let result = text

  // 1. Aplicar dicionário de palavras com X (maior precisão)
  for (const [word, pronunciation] of Object.entries(X_WORD_DICTIONARY)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), pronunciation)
  }

  // 2. X restantes: regra geral contextual
  // X antes de consoante = S (ex: "extensão" → já coberto pelo dicionário, mas fallback)
  // X no final de sílaba antes de consoante
  result = result.replace(/\bx([bcdfghjklmnpqrstvwxyz])/gi, (match, consonant) => {
    const isUpper = match[0] === match[0].toUpperCase()
    return isUpper ? `S${consonant}` : `s${consonant}`
  })

  // 3. X entre vogais que não foi coberto = KS (fallback)
  result = result.replace(/([aeiouáàãâéèêíïóôõúü])x([aeiouáàãâéèêíïóôõúü])/gi, (match, v1, v2) => {
    return `${v1}ks${v2}`
  })

  return result
}

// ============================================================
// TAGS DE CONTROLE DE PROSÓDIA (SSML-like)
// ============================================================

/**
 * Tags de controle que o usuário pode inserir no texto.
 * São processadas ANTES do dicionário e do regex.
 *
 * Sintaxe: {{tag:valor}}
 *
 * Tags suportadas:
 * - {{pause:500}} → Pausa de 500ms (insere vírgula longa)
 * - {{pause:short}} → Pausa curta (300ms)
 * - {{pause:medium}} → Pausa média (600ms)
 * - {{pause:long}} → Pausa longa (1000ms)
 * - {{emphasis}} ... {{/emphasis}} → Ênfase na palavra/frase (repetição suave)
 * - {{slow}} ... {{/slow}} → Falar mais devagar (insere pausas entre palavras)
 * - {{fast}} ... {{/fast}} → Falar mais rápido (remove pausas)
 * - {{whisper}} ... {{/whisper}} → Sussurro (insere "." antes de cada palavra)
 */
export function processControlTags(text: string, engine: TTSEngine = 'vozpro'): string {
  let result = text

  // 0. Se contém SSML, converter para formato nativo PRIMEIRO
  if (containsSSML(result)) {
    result = parseSSML(result, engine)
  }

  // 1. Pause tags (custom syntax)
  result = result.replace(/\{\{pause:(\d+)\}\}/g, (_match, ms) => {
    const n = parseInt(ms)
    if (n >= 800) return '... '
    if (n >= 400) return '.. '
    return '. '
  })

  result = result.replace(/\{\{pause:long\}\}/g, '... ')
  result = result.replace(/\{\{pause:medium\}\}/g, '.. ')
  result = result.replace(/\{\{pause:short\}\}/g, '. ')

  // 2. Emphasis — wrap in double brackets for stronger pronunciation
  result = result.replace(/\{\{emphasis\}\}(.*?)\{\{\/emphasis\}\}/g, '[$1]')

  // 3. Whisper — add dots before words for softer delivery
  result = result.replace(/\{\{whisper\}\}(.*?)\{\{\/whisper\}\}/gs, (_match, content) => {
    return content.split(' ').map(w => `.${w}`).join(' ')
  })

  // 4. Slow — add commas between words
  result = result.replace(/\{\{slow\}\}(.*?)\{\{\/slow\}\}/gs, (_match, content) => {
    return content.replace(/,/g, ',,,')
  })

  // 5. Fast — remove extra spaces
  result = result.replace(/\{\{fast\}\}(.*?)\{\{\/fast\}\}/gs, (_match, content) => {
    return content.replace(/\s+/g, ' ')
  })

  // 6. Remove any unprocessed tags
  result = result.replace(/\{\{\/?\w+}\}/g, '')

  return result
}

// ============================================================
// REGEX EXPANDIDO — TODOS OS PADRÕES PT-BR
// ============================================================

/**
 * Pipeline completa de otimização de pronúncia (regex, 0ms).
 *
 * Correções na ordem:
 * 1. Artigos após pontuação (elimina hesitação)
 * 1b. Artigos iniciais O/A antes de nomes próprios e títulos
 * 1c. Pré-processador de X (6 sons contextuais)
 * 2. Números por extenso (evita leitura literal)
 * 3. Valores monetários
 * 4. Porcentagens
 * 5. Horários completos (14h30, 08:30)
 * 6. Datas (15/03/2024)
 * 7. Telefones ((11) 99999-9999)
 * 8. Ordinais (1º, 2ª, 3º)
 * 9. Abreviações (do dicionário)
 * 10. Siglas/acrônimos (do dicionário)
 * 11. Estrangeirismos (do dicionário)
 * 12. Palavras problemáticas (do dicionário)
 * 13. URLs
 * 14. Emails
 * 15. Pontuação dupla e limpeza
 */
export function optimizePronunciation(text: string): string {
  let result = text

  // ---- 0. PROCESSAR TAGS DE CONTROLE ANTES DE TUDO ----
  result = processControlTags(result)

  // ---- 1. ARTIGOS APÓS PONTUAÇÃO (elimina hesitação do TTS) ----
  // ". O sistema" → ", o sistema" (troca ponto por vírgula = une frases)
  result = result.replace(/([.!?])\s+([OoAa])\s(?=[a-záàãâéèêíïóôõúüç])/g, ',$2 ')
  result = result.replace(/([.!?])\s+([Oo]s|[Aa]s|[Uu]m(?:[oa]s)?)\s(?=[a-záàãâéèêíïóôõúüç])/g, ',$2 ')

  // ---- 1b. ARTIGOS INICIAIS O/A ANTES DE NOMES PRÓPRIOS E TÍTULOS ----
  // O modelo ENGOLE o "O" antes de nomes próprios maiúsculos
  // "O Dr." → "[o] Doutor", "O Wolski" → "[o] [Volski]"
  // Padrão: O/A maiúsculo no início da frase ou após pontuação + palavra maiúscula
  result = result.replace(/\b([Oo])\s+(Dr\.|Dra\.|Sr\.|Sra\.|Prof\.|Profa\.|Gov\.|Emb\.|Cel\.|Maj\.|Gen\.|Min\.)/g, '[$1] $2')
  // Artigo antes de nome próprio (maiúscula após artigo isolado)
  result = result.replace(/(?:^|\n|[,;!?]\s*)([Oo])\s+([A-Z][a-záàãâéèêíïóôõúüç])/g, (match, artigo, name) => {
    return match.replace(`${artigo} ${name}`, `[${artigo}] ${name}`)
  })
  // Artigo "A" antes de nome próprio feminino
  result = result.replace(/(?:^|\n|[,;!?]\s*)([Aa])\s+([A-Z][a-záàãâéèêíïóôõúüç])/g, (match, artigo, name) => {
    return match.replace(`${artigo} ${name}`, `[${artigo}] ${name}`)
  })

  // ---- 1c. PRÉ-PROCESSADOR DE X (6 sons contextuais em PT-BR) ----
  // O modelo NÃO sabe qual som de X usar pelo contexto
  // Regras contextuais de pronúncia do X:
  //   - X antes de vogal tônica = KS (táxi, sexo, têxtil)
  //   - X após E = KS (complexo, sexo, têxtil, perplexo)
  //   - X antes de consonante = S (extensão, explicar, exportar)
  //   - X em palavras específicas = CH (xarope, xaxim, xadrez, enxada)
  //   - X em palavras específicas = Z (exército, exemplo, exercício, existir)
  //   - X em palavras específicas = SS (México pronunciado Méchico, vexame)
  // Implementado como função auxiliar abaixo
  result = preprocessX(result)

  // ---- 1d. REGRAS FONÉTICAS PT-BR AUTOMÁTICAS (cobrem milhares de palavras) ----
  // H MUDO no início de palavras — PT-BR: H inicial é SEMPRE mudo
  // "hoje" → "oje", "Hoje" → "oje", "HOMEM" → "omem"
  // IMPORTANTE: manter minúsculo! O TTS lê letra maiúscula como nome próprio e inventa H
  result = result.replace(/\b[Hh]([aeiouáàãâéèêíïóôõúü])/g, (_, v) => v)

  // ---- 2. NÚMEROS GRANDES POR EXTENSO ----
  // Anos: "2024" → "[dois mil vinte e quatro]" (quando precedido por "ano" ou similar)
  result = result.replace(/(?:ano|Ano|ANO)\s+(\d{4})/g, (match, year) => {
    const y = parseInt(year)
    if (y >= 1000 && y <= 2100) return match.replace(year, `[${numberToWords(y)}]`)
    return match
  })

  // Números isolados grandes (1.000, 2.500, etc. — com ponto de milhar PT-BR)
  result = result.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (match) => {
    const n = parseInt(match.replace(/\./g, ''))
    if (n <= 999999999) return `[${numberToWords(n)}]`
    return match
  })

  // Números decimais: "3,5" → "[três vírgula cinco]"
  result = result.replace(/\b(\d+),(\d+)\b/g, (match, intPart, decPart) => {
    const n = parseInt(intPart)
    if (n > 0 && n <= 999) {
      const intWord = numberToWords(n)
      const decDigits = decPart.split('').map(d => numberToWords(parseInt(d))).join(' ')
      return `[${intWord} vírgula ${decDigits}]`
    }
    return match
  })

  // Números isolados pequenos (1-999) em contexto textual
  result = result.replace(/\b(\d{1,3})\b/g, (match, numStr) => {
    const n = parseInt(numStr)
    // Só converte se estiver em contexto textual (não dentro de colchetes, URLs, etc.)
    if (n > 0 && n <= 999) {
      // Verifica se está dentro de colchetes (já processado)
      const before = result.substring(Math.max(0, result.indexOf(match) - 1), result.indexOf(match))
      if (before === '[') return match
      return `[${numberToWords(n)}]`
    }
    return match
  })

  // ---- 3. VALORES MONETÁRIOS ----
  // R$ com valor completo: "R$ 1.599,90" → "[mil quinhentos e noventa e nove reais e noventa centavos]"
  result = result.replace(/R\$\s*([\d.,]+)/g, (match, val) => {
    return `[${currencyToWords(val)}]`
  })

  // Dólar: "$ 100" ou "US$ 100"
  result = result.replace(/(?:US\$|\$)\s*([\d.,]+)/g, (match, val) => {
    const clean = val.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    if (isNaN(n)) return match
    return `[${n === 1 ? 'um dólar' : numberToWords(Math.floor(n)) + ' dólares'}]`
  })

  // ---- 4. PORCENTAGENS ----
  result = result.replace(/(\d+)(?:\s*%|\s*por cento)/gi, (match, numStr) => {
    const n = parseInt(numStr)
    if (isNaN(n)) return match
    return `[${numberToWords(n)} por cento]`
  })

  // ---- 5. HORÁRIOS COMPLETOS ----
  // "14h30" ou "14h30min" → "[quatorze] horas e [trinta] minutos"
  result = result.replace(/(\d{1,2})h(\d{2})(?:min)?/gi, (match, hourStr, minStr) => {
    const h = parseInt(hourStr)
    const m = parseInt(minStr)
    if (h < 0 || h > 23 || m < 0 || m > 59) return match
    let text = `[${numberToWords(h)}] horas`
    if (m > 0) text += ` e [${numberToWords(m)}] minutos`
    return text
  })

  // "14h" simples → "[quatorze] horas"
  result = result.replace(/(\d{1,2})\s*h(?!\w)/gi, (match, numStr) => {
    const n = parseInt(numStr)
    if (isNaN(n) || n < 0 || n > 23) return match
    return `[${numberToWords(n)}] horas`
  })

  // "08:30" como horário → "[oito] horas e [trinta] minutos"
  result = result.replace(/\b(\d{1,2}):(\d{2})\b/g, (match, hourStr, minStr) => {
    const h = parseInt(hourStr)
    const m = parseInt(minStr)
    // Verifica se é horário (0-23h, 0-59min) e não data
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && m > 0) {
      return `[${numberToWords(h)}] horas e [${numberToWords(m)}] minutos`
    }
    return match
  })

  // ---- 6. DATAS ----
  // "15/03/2024" → "[quinze de março de dois mil vinte e quatro]"
  const MONTHS: Record<string, string> = {
    '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
    '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
    '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro',
  }
  result = result.replace(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/g, (match, day, month, year) => {
    const d = parseInt(day)
    const m = MONTHS[month]
    const y = parseInt(year)
    if (d >= 1 && d <= 31 && m && y >= 1000) {
      return `[${numberToWords(d)} de ${m} de ${numberToWords(y)}]`
    }
    return match
  })

  // Data curta: "15/03" → "[quinze de março]"
  result = result.replace(/\b(\d{1,2})\/(\d{2})\b/g, (match, day, month) => {
    const d = parseInt(day)
    const m = MONTHS[month]
    if (d >= 1 && d <= 31 && m) {
      return `[${numberToWords(d)} de ${m}]`
    }
    return match
  })

  // ---- 7. TELEFONES ----
  // "(11) 99999-9999" → "[onze] [nove nove nove nove nove] [nove nove nove nove]"
  result = result.replace(/\((\d{2})\)\s*(\d{4,5})-?(\d{4})/g, (match, ddd, prefix, suffix) => {
    const dddWord = `[${numberToWords(parseInt(ddd))}]`
    const prefixDigits = prefix.split('').map(d => numberToWords(parseInt(d))).join(' ')
    const suffixDigits = suffix.split('').map(d => numberToWords(parseInt(d))).join(' ')
    return `${dddWord} [${prefixDigits}] [${suffixDigits}]`
  })

  // "11 99999-9999" → mesma lógica
  result = result.replace(/\b(\d{2})\s*(\d{4,5})-?(\d{4})\b/g, (match, ddd, prefix, suffix) => {
    const dddN = parseInt(ddd)
    if (dddN >= 11 && dddN <= 99) {
      const dddWord = `[${numberToWords(dddN)}]`
      const prefixDigits = prefix.split('').map(d => numberToWords(parseInt(d))).join(' ')
      const suffixDigits = suffix.split('').map(d => numberToWords(parseInt(d))).join(' ')
      return `${dddWord} [${prefixDigits}] [${suffixDigits}]`
    }
    return match
  })

  // ---- 8. ORDINAIS ----
  // "1º" → "[primeiro]", "2ª" → "[segunda]", etc.
  const ORDINALS_MASC: Record<string, string> = {
    '1': 'primeiro', '2': 'segundo', '3': 'terceiro', '4': 'quarto',
    '5': 'quinto', '6': 'sexto', '7': 'sétimo', '8': 'oitavo',
    '9': 'nono', '10': 'décimo',
  }
  const ORDINALS_FEM: Record<string, string> = {
    '1': 'primeira', '2': 'segunda', '3': 'terceira', '4': 'quarta',
    '5': 'quinta', '6': 'sexta', '7': 'sétima', '8': 'oitava',
    '9': 'nona', '10': 'décima',
  }

  result = result.replace(/(\d+)º/g, (match, num) => {
    if (ORDINALS_MASC[num]) return `[${ORDINALS_MASC[num]}]`
    return `[${numberToWords(parseInt(num))}ésimo]`
  })

  result = result.replace(/(\d+)ª/g, (match, num) => {
    if (ORDINALS_FEM[num]) return `[${ORDINALS_FEM[num]}]`
    return `[${numberToWords(parseInt(num))}ésima]`
  })

  // ---- 9-10-11. DICIONÁRIO (abreviações + siglas + estrangeirismos + problemáticas) ----
  for (const [word, pronunciation] of Object.entries(PRONUNCIATION_DICTIONARY)) {
    // Usar word boundary para não substituir substrings
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Para siglas (todas maiúsculas sem ponto), usa boundary exato
    if (/^[A-Z0-9]{2,}$/.test(word)) {
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), pronunciation)
    } else if (word.endsWith('.')) {
      // Abreviações com ponto — manter o boundary com ponto
      result = result.replace(new RegExp(escaped, 'g'), pronunciation)
    } else {
      // Palavras normais — word boundary
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), (match) => {
        // Preservar capitalização do primeiro caractere
        const pron = pronunciation
        if (match[0] === match[0].toUpperCase() && match.length > 1) {
          // Tudo maiúsculo ou primeira maiúscula
          return pron
        }
        return pron
      })
    }
  }

  // ---- 12. URLs ----
  result = result.replace(/(https?:\/\/)([^\s]+)/gi, (match, protocol, domain) => {
    const spelled = domain.split('').map(c => {
      if (c === '.') return ' ponto '
      if (c === '/') return ' barra '
      if (c === '-') return ' traço '
      if (c === '_') return ' underline '
      if (c === ':') return ' dois pontos '
      if (c === '@') return ' arroba '
      if (c === '~') return ' til '
      return c
    }).join('')
    return `[${protocol.replace('https', 'agá tê tê pê és').replace('http', 'agá tê tê pê').replace('://', ' dois pontos barra barra')} ${spelled}]`
  })

  result = result.replace(/www\.([^\s]+)/gi, (match, domain) => {
    const spelled = domain.split('').map(c => {
      if (c === '.') return ' ponto '
      if (c === '/') return ' barra '
      if (c === '-') return ' traço '
      return c
    }).join('')
    return `[dabliu dabliu dabliu ponto ${spelled}]`
  })

  // ---- 13. EMAILS ----
  result = result.replace(/(\S+)@(\S+\.\S+)/g, (match, user, domain) => {
    const domainSpelled = domain.split('').map(c => {
      if (c === '.') return ' ponto '
      return c
    }).join('')
    return `[${user} arroba ${domainSpelled}]`
  })

  // ---- 14. LIMPEZA FINAL ----
  // Remover colchetes duplos: "[[texto]]" → "[texto]"
  result = result.replace(/\[\[([^\]]+)\]\]/g, '[$1]')

  // Remover colchetes ao redor de colchetes: "[[]]" → "[]"
  result = result.replace(/\[\[/g, '[')
  result = result.replace(/\]\]/g, ']')

  // Espaços múltiplos
  result = result.replace(/  +/g, ' ')

  return result
}

// ============================================================
// LLM FALLBACK (opcional, para termos não cobertos pelo regex)
// ============================================================

const LLM_SYSTEM_PROMPT = `Você é um agente especialista em otimização de pronúncia para TTS (text-to-speech) em português brasileiro.

Seu trabalho: analisar o texto e corrigir APENAS as palavras que o TTS pode pronunciar errado, usando colchetes [pronúncia correta].

## REGRAS OBRIGATÓRIAS:

1. **Nomes próprios incomuns**: Adicione pronúncia guia se necessário.
   - "Wolski" → "[Volski]"
   - "Xangai" → "[Xangai]"
   
2. **Termos técnicos/especializados** que o regex não cobriu:
   - Termos médicos, jurídicos, científicos
   - Nomes de medicamentos
   - Termos em outros idiomas não comuns

3. **Siglas e acrônimos não cobertos**:
   - Soletrar: "NASA" → "[êne á és é]"

## REGRAS DE NÃO INTERFERÊNCIA:

- NÃO altere palavras que já estão entre colchetes [ ] (já foram processadas)
- NÃO adicione vírgulas ou pontuação que não existia
- NÃO altere a estrutura das frases
- NÃO traduza palavras — apenas corrija pronúncia
- NÃO resuma ou encurte o texto de NENHUMA forma
- Mantenha TODOS os pontos finais, vírgulas, exclamações e interrogações EXATAMENTE onde estão

## FORMATO DE SAÍDA:
Responda APENAS com o texto corrigido. Nenhuma explicação.`

/**
 * Verifica se o texto provavelmente precisa de processamento LLM
 * (termos que o regex não consegue cobrir)
 */
export function needsLLMProcessing(text: string): boolean {
  // Se tem muitas palavras entre colchetes, o regex já trabalhou — skip
  const bracketCount = (text.match(/\[/g) || []).length
  const wordCount = text.split(/\s+/).length
  if (wordCount === 0) return false

  // Se mais de 50% das palavras já têm colchetes, provavelmente tá bom
  if (bracketCount / wordCount > 0.5) return false

  // Verificar indicadores de termos que regex não cobre
  const hasProperNouns = /[A-Z][a-z]{3,}[A-Z]/.test(text) // CamelCase
  const hasUnusualChars = /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ]/i.test(text) === false && /[^\w\s.,;:!?()[\]{}@#$%&*+=\-\/\\]/.test(text)
  const hasLongUppercase = /\b[A-Z]{4,}\b/.test(text) // Siglas longas

  return hasProperNouns || hasUnusualChars || hasLongUppercase
}

export { LLM_SYSTEM_PROMPT }

export type { TTSEngine } from './ssml-parser'
export { containsSSML, parseSSML } from './ssml-parser'
