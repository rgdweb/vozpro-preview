/**
 * Pronunciation Optimizer — Pipeline completo de pronúncia PT-BR para TTS
 *
 * Camada 1: Regex expandido (0ms de latência)
 * Camada 1.5: G2P via espeak-ng (fallback para palavras desconhecidas, ~10ms)
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
  'how': 'ráu',
  'How': 'Ráu',
  'help': 'répe',
  'Help': 'Répe',
  'here': 'ríar',
  'Here': 'Ríar',
  'her': 'rêr',
  'Her': 'Rêr',
  'him': 'ríme',
  'Him': 'Ríme',
  'his': 'ríz',
  'His': 'Ríz',
  'happy': 'répi',
  'Happy': 'Répi',
  'hope': 'rôupe',
  'Hope': 'Rôupe',
  'heart': 'rárt',
  'Heart': 'Rárt',
  'health': 'rélfe',
  'Health': 'Rélfe',
  'half': 'réfe',
  'Half': 'Réfe',
  'hand': 'rénde',
  'Hand': 'Rénde',
  'head': 'réd',
  'Head': 'Réd',
  'hold': 'róulde',
  'Hold': 'Róulde',
  'hard': 'rárde',
  'Hard': 'Rárde',
  'hurt': 'rêrte',
  'Hurt': 'Rêrte',
  'huge': 'iúdje',
  'Huge': 'Iúdje',
  'human': 'iúmene',
  'Human': 'Iúmene',
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
  'streaming': 'estrimíngue',
  'Streaming': 'Estrimíngue',
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
  'set': 'sét',

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

  // === Nº / n.º (ABREVIATURA DE "NÚMERO") ===
  'Nº': 'número', 'nº': 'número', 'N.º': 'número', 'n.º': 'número',
  'Noº': 'número', 'noº': 'número', 'N.º': 'número', 'n.º': 'número',

  // === a.m. / p.m. (PERÍODOS DO DIA) ===
  'a.m.': 'da manhã', 'A.M.': 'da manhã', 'am': 'da manhã', 'AM': 'da manhã',
  'p.m.': 'da tarde', 'P.M.': 'da tarde', 'pm': 'da tarde', 'PM': 'da tarde',
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
  // === H MUDO — REMOVIDO DO DICIONÁRIO ===
  // Antes: 'hoje': 'oje', 'homem': 'omem', etc.
  // Problema: estar no dicionário adicionava ao H_DICT_WORDS, que PROTEGIA a palavra
  // da regex do H mudo (step 1d). Se o dicionário falhasse por qualquer motivo,
  // o H permanecia. Agora essas palavras são tratadas DIRETAMENTE pela regex 1d
  // (h+vogal → remove H), que cobre TODAS as palavras com H mudo em PT-BR.
  // palavas afetadas: hoje, homem, honesto, higiene, historia, harmonia,
  // hernia, heranca, horizonte, hidraulico, humor, homicidio, helicóptero, etc.

  'xingar': 'chingar',
  'xingamento': 'chingamento',

  // === ACENTOS QUE CONFUNDEM O TTS ===
  // O acento agudo faz o TTS alongar/distorcer a vogal
  // "frequência" → TTS lê com ê esticado e errado, mas "frequencia" → pronuncia certo
  'frequência': 'frequencia',
  'Frequência': 'Frequencia',
  'FREQUÊNCIA': 'FREQUENCIA',

  'lapso': 'lápsso',
  'Lapso': 'Lápsso',

  // === NOMES PRÓPRIOS DIFÍCEIS ===
  'Wolski': 'Vólsqui',
  'Kowalski': 'Covalsqui',
  'Higashi': 'Rigaxi',
  'Schütz': 'Xuts',


  'Yngrid': 'Ingrid',
  "L'Oréal": 'Loreal',

  // === MARCAS / NEGÓCIOS (expansão Fase 1) ===
  'Carrefour': 'Carrefur',


  'Apple': 'Épel',
  'Microsoft': 'Maicrósofte',
  'Amazon': 'Amázón',
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
  'TikTok': 'Títóque',


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
  'QR code': 'quér code',
  'CEO': 'cê i ó',
  'CFO': 'cê éfe ó',
  'CTO': 'cê tê ó',
  'RH': 'erre agá',
  'PK': 'pê cá',
  'NGO': 'êne gê ô',
  'GPT': 'gê pê tê',
  'LLM': 'éle éleême',
  'SSR': 'és és ér',
  'VPN': 'vê pê éne',
  'LAN': 'éle agá éne',
  'RAM': 'erre agá éme',
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
  // CNPJ, CPF, INSS, IPTU já definidos na seção de siglas (linhas 123-124, 130-131)
  'PIS': 'pê i esse',
  'PASEP': 'pá êse é pê',
  'FGTS': 'éfe gê tê esse',
  // INSS já definido
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
  'CAGR': 'cê a gê erre',
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
  'Gemini': 'Gêmini',
  'Copilot': 'Copailete',
  'Midjourney': 'Midjórnei',
  'Stable Diffusion': 'Steibol Difiújion',
  'Hugging Face': 'Raguein Feice',
  'Gradio': 'Grádio',

  // === APPS E SERVIÇOS POPULARES (essenciais PT-BR) ===
  'Netflix': 'Nétflíx',
  'Spotify': 'Spótaifei',
  'WhatsApp': 'Uótsape',
  'YouTube': 'Iútube',
  'Instagram': 'Instagrãe',
  'Facebook': 'Feisbúque',
  'Uber': 'Úber',
  'Twitter': 'Tuíter',
  'Telegram': 'Telegreime',
  'Pinterest': 'Pintéreste',
  'LinkedIn': 'Línquede In',
  'Twitch': 'Tuítche',
  'TikTok': 'Títóque',

  // === MARCAS GLOBAIS COMUNS ===
  'Samsung': 'Sãssum',
  'Nike': 'Náique',
  'Adidas': 'Adídace',
  'Xiaomi': 'Xáomi',
  'Motorola': 'Motoróla',
  'Sony': 'Sóne',
  'Panasonic': 'Panassóneque',
  'Philips': 'Fílipe',
  'Nvidia': 'Envídia',
  'Intel': 'Íntel',
  'AMD': 'A Éme Dê',

  // === INGLÊS COM H (protegidas do H-mudo) ===
  'hosting': 'róstinge',
  'hackathon': 'rácáton',
  'holding': 'rôldingue',
  'headset': 'rédset',
  'hotspot': 'rótspot',

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
  'Heroku': '[Hérôcu]',
  'DigitalOcean': 'Digital Océan',
  'AWS': 'a dábliu és',
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
// SET DE PALAVRAS DO DICIONÁRIO QUE COMEÇAM COM H
// ============================================================
/**
 * Palavras do dicionário que começam com H/h e que devem MANTER o H.
 * Usado para PROTEGER essas palavras da regex do H mudo (passo 1d).
 * Sem essa proteção, "Hello" virava "ello" antes do dicionário poder substituir.
 * Só inclui palavras em inglês e marcas ("Hello", "Hear", "Herbalife", "Heroku").
 * Palavras PT-BR com H mudo (hoje, homem, etc.) NÃO estão mais no dicionário,
 * portanto não são protegidas — a regex do H mudo cuida delas diretamente.
 */
const H_DICT_WORDS = new Set<string>()
for (const w of Object.keys(PRONUNCIATION_DICTIONARY)) {
  if (/^[Hh]/.test(w)) {
    H_DICT_WORDS.add(w.toLowerCase())
  }
}

// ============================================================
// DICIONÁRIO DE ACENTUAÇÃO FORÇADA (STRESS DICTIONARY)
// ============================================================

/**
 * Palavras que o TTS pronuncia com a sílaba tônica ERRADA.
 * Adiciona acento agudo/circunflexo para forçar a sílaba correta.
 *
 * O TTS OmniVoice usa acentos como dica de pronúncia:
 * - á/é/í/ó/ú = sílaba tônica aberta (som forte)
 * - â/ê/ô = sílaba tônica fechada
 *
 * Exemplos de erros comuns:
 * - "vídeo" → TTS fala "vi-DÊ-o" → corrigido para "vÍdeo" (errado) → melhor: manter "vídeo"
 * - "público" → TTS fala "pu-BLI-co" → corrigido para "pÚblico"
 * - "difícil" → TTS fala "di-fi-CÍL" → corrigido para "dÍficil"
 *
 * Formato: palavra_sem_acento → palavra_com_acento_forçado
 * IMPORTANTE: Só adicionar palavras onde o TTS REALMENTE erra.
 * Não adicionar palavras que já são pronunciadas corretamente.
 */
const STRESS_DICTIONARY: Record<string, string> = {
  // === PROPAROXÍTONAS (stress na antepenúltima) que o TTS confunde ===
  // O TTS frequentemente muda o stress para a penúltima sílaba
  'lampada': 'lâmpada',
  'medico': 'médico',
  'medica': 'médica',
  'publico': 'público',
  'publica': 'pública',
  'rapido': 'rápido',
  'rapida': 'rápida',
  'musica': 'música',
  'video': 'vídeo',
  'dificil': 'difícil',
  'facil': 'fácil',
  'possivel': 'possível',
  'ifen': 'ífen',     // H mudo já rodou antes — key é pos-H-mudo
  'otel': 'ôtel',    // hotel → H mudo → otel — acento força o-TÉL
  'oras': 'óras',    // horas → H mudo → oras — acento força Ó-ras
  'acesse': 'acésse', // TTS pode trocar stress → força a-CÉS-se
  'artico': 'ártico',
  'polen': 'pólen',
  'indice': 'índice',
  'album': 'álbum',
  'capsula': 'cápsula',
  'biblia': 'bíblia',
  'missil': 'míssil',
  'carater': 'caráter',
  'solido': 'sólido',
  'odio': 'ódio',
  'transito': 'trânsito',
  'animo': 'ânimo',
  'aereo': 'aéreo',
  'privilegio': 'privilégio',

  // === PAROXÍTONAS (stress na penúltima) que o TTS confunde ===
  'util': 'útil',
  'virgula': 'vírgula',

  // === OXÍTONAS (stress na última) que o TTS confunde ===
  'voce': 'você',
  'tambem': 'também',
  'ninguem': 'ninguém',
  'alguem': 'alguém',
  'ja': 'já',
  'nos': 'nós',
  'tres': 'três',
  'pais': 'país',
  'avos': 'avós',

  // === PAROXÍTONAS COMUNS removidas — o TTS já fala naturalmente ===
  // Palavras como cerebro, governo, historia, memoria, negocio, materia, familia
  // são paroxítonas regulares (stress na penúltima = padrão do PT-BR).
  // O TTS pronuncia corretamente SEM acento. Não adicionar aqui.

  // === PROPAROXÍTONAS COMUNS (stress na antepenúltima) ===
  // Proparoxítonas SÃO as que mais precisam de acento pois o TTS tende
  // a colocar o stress na penúltima (padrão) ao invés da antepenúltima.
  // TODAS as proparoxítonas precisam de acento em PT-BR
  // Se o usuário digitar sem acento, o TTS pode errar a sílaba tônica
  'matematica': 'matemática',
  'analise': 'análise',
  'quimica': 'química',
  'fisica': 'física',
  'logica': 'lógica',
  'topico': 'tópico',
  'grafico': 'gráfico',
  'tragico': 'trágico',
  'magico': 'mágico',
  'cosmico': 'cósmico',
  'metodo': 'método',
  'periodo': 'período',
  'diario': 'diário',
  'cenario': 'cenário',
  'necessario': 'necessário',
  'extraordinario': 'extraordinário',
  'extraordinaria': 'extraordinária',
  'provavel': 'provável',
  'agradavel': 'agradável',
  'razoavel': 'razoável',
  'consideravel': 'considerável',
  'confortavel': 'confortável',
  'invisivel': 'invisível',
  'visivel': 'visível',
  'acessivel': 'acessível',
  'sensivel': 'sensível',
  'responsavel': 'responsável',
  'compativel': 'compatível',
  'flexivel': 'flexível',
  'terrivel': 'terrível',
  'horrivel': 'horrível',
  'crivel': 'crível',
  'fatigavel': 'fatigável',
  'numero': 'número',
  'numeros': 'números',
  'varios': 'vários',
  'proprio': 'próprio',
  'palido': 'pálido',
  'ridiculo': 'ridículo',
  'estrategico': 'estratégico',
  'democratico': 'democrático',
  'autentico': 'autêntico',
  'energetico': 'energético',
  'especifico': 'específico',
  'academico': 'acadêmico',
  'cientifico': 'científico',
  'pratico': 'prático',
  'teorico': 'teórico',
  'empirico': 'empírico',
  'consequencia': 'consequência',
  'essencia': 'essência',
  'elegancia': 'elegância',
  'excelencia': 'excelência',
  'tolerancia': 'tolerância',
  'experiencia': 'experiência',
  'consciencia': 'consciência',
  'violencia': 'violência',
  'silencio': 'silêncio',
  'exito': 'êxito',
  'deficit': 'déficit',
  'acrescimo': 'acréscimo',
  'decrescimo': 'decréscimo',
  'juridico': 'jurídico',
  'obrigatorio': 'obrigatório',
  'voluntario': 'voluntário',
  'temporario': 'temporário',
  'secretario': 'secretário',
  'revolucionario': 'revolucionário',
  'contrario': 'contrário',
  'precario': 'precário',
  'ordinario': 'ordinário',
  'liturgico': 'litúrgico',
  'cirurgico': 'cirúrgico',
  'pontuario': 'pontuário',
  'itinerario': 'itinerário',
  'salario': 'salário',
  'aniversario': 'aniversário',
  'necropsia': 'necrópsia',
  'biopsia': 'biópsia',
  'sintese': 'síntese',
  'hipotese': 'hipótese',
  'dormitorio': 'dormitório',
  'lavatorio': 'lavatório',
  'santuario': 'santuário',
  'filosofico': 'filosófico',
  'tecnologico': 'tecnológico',
  'biologico': 'biológico',
  'psicologico': 'psicológico',
  'demografico': 'demográfico',
  'geografico': 'geográfico',
  'ideologico': 'ideológico',
  'metodologico': 'metodológico',
  'genealogico': 'genealógico',

  // === PAROXÍTONAS terminadas em ditongo ===
  'agua': 'água',
  'agueda': 'águeda',
  'regua': 'régua',
  'papeis': 'papéis',
  'misterio': 'mistério',
  'nucleo': 'núcleo',
  'nucleos': 'núcleos',
  'automovel': 'automóvel',
  'automoveis': 'automóveis',
  'fosseis': 'fósseis',
  'aneis': 'anéis',
  'veroes': 'verões',
  'variavel': 'variável',
  'notavel': 'notável',
  'duravel': 'durável',
  'memoravel': 'memorável',
  'indispensavel': 'indispensável',
  'comercial': 'comercial',
  'acessivel': 'acessível',
  'compativel': 'compatível',
  'incontrolavel': 'incontrolável',
  'inevitavel': 'inevitável',
  'improvavel': 'improvável',

  // === PROPAROXÍTONAS comuns que o TTS confunde ===
  'otimo': 'ótimo',
  'otima': 'ótima',
  'arvore': 'árvore',
  'proximo': 'próximo',
  'proxima': 'próxima',
  'minimo': 'mínimo',
  'minima': 'mínima',
  'maximo': 'máximo',
  'maxima': 'máxima',
  'liquido': 'líquido',
  'tecnicas': 'técnicas',
  'tecnica': 'técnica',
  'cientifico': 'científico',
  'economia': 'economia',
  'estrategia': 'estratégia',
  'energetico': 'energético',
  'medico': 'médico',
  'historico': 'histórico',
  'periodo': 'período',
  'metodo': 'método',
  'matematica': 'matemática',
  'quimica': 'química',
  'fisica': 'física',
  'geometria': 'geometria',
  'arquitetura': 'arquitetura',
  'biblioteca': 'biblioteca',
  'misterio': 'mistério',
  'terapeutico': 'terapêutico',
  'preventivo': 'preventivo',
  'perspectiva': 'perspectiva',
  'obrigatorio': 'obrigatório',
  'temporario': 'temporário',
  'voluntario': 'voluntário',
  'complementar': 'complementar',
  'excepcional': 'excepcional',
  'extraordinario': 'extraordinário',

  // === PAROXÍTONAS terminadas em -l (precisam de acento) ===
  'amavel': 'amável',
  'afavel': 'afável',
  'futil': 'fútil',
  'fragil': 'frágil',
  'agil': 'ágil',

  // === OXÍTONAS (stress na última) que o TTS confunde ===
  'ate': 'até',
  'porem': 'porém',
  'refem': 'refém',
  'refens': 'reféns',
  'cancao': 'canção',
  'ilusao': 'ilusão',
  'visao': 'visão',
  'divisao': 'divisão',
  'conclusao': 'conclusão',
  'decisao': 'decisão',
  'explosao': 'explosão',
  'dimensao': 'dimensão',
  'extensao': 'extensão',
  'versao': 'versão',
  'emocao': 'emoção',
  'paixao': 'paixão',
  'coracao': 'coração',
  'funcionarios': 'funcionários',
  'pos': 'pós',
  'pre': 'pré',
  'quarentao': 'quarentão',
  'verao': 'verão',
  'reporter': 'repórter',
  'alem': 'além',
  'alem_disso': 'além disso',

  // === H MUDO — SEM correção de stress ===
  // Após o regex de H mudo (step 1d), "hoje" vira "oje" e "homem" vira "omem".
  // O TTS pronuncia essas palavras corretamente SEM acento adicional.
  // NÃO adicionar acentos aqui — o TTS já fala naturalmente.
  // Exemplo errado: "oje" → "ojé" (TTS já fala "oje" correto)
  // Exemplo errado: "omem" → "omém" (se fosse acentuar seria "ômem", não "omém")
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
  // === DEIXAR / CAIXA / QUEIXA / FAIXA (X = CH) ===
  // CRITICAL: These MUST be in X_WORD_DICTIONARY to be caught BEFORE the X fallback regex
  // If they're only in PRONUNCIATION_DICTIONARY, the X preprocessor converts them first
  'deixar': 'deichar',
  'Deixar': 'Deichar',
  'deixou': 'deichou',
  'Deixou': 'Deichou',
  'deixo': 'deicho',
  'Deixo': 'Deicho',
  'deixe': 'deiche',
  'Deixe': 'Deiche',
  'deixei': 'deichei',
  'deixada': 'deichada',
  'deixado': 'deichado',
  'deixamos': 'deichamos',
  'deixaram': 'deicharam',
  'deixem': 'deichem',
  'deixarão': 'deicharão',
  'deixaria': 'deicharia',
  'deixá': 'deichá',
  'deixaste': 'deichaste',
  'caixa': 'caicha',
  'Caixa': 'Caicha',
  'caixão': 'caichão',
  'caixas': 'caichas',
  'Caixas': 'Caichas',
  'queixa': 'queicha',
  'Queixa': 'Queicha',
  'queixar': 'queichar',
  'queixoso': 'queichoso',
  'queixada': 'queichada',
  'queixume': 'queichume',
  'faixa': 'faicha',
  'Faixa': 'Faicha',
  'faixas': 'faichas',
  'Faixas': 'Faichas',
  'enfeixar': 'enfeichar',

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

  // X = SS (som de "ss") — continuação
  // máximo/máxima em PT-BR usam som de SS (mássimo, mássima), não KS
  'máximo': 'mássimo',
  'Máximo': 'Mássimo',
  'MÁXIMO': 'MÁSSIMO',
  'máxima': 'mássima',
  'Máxima': 'Mássima',
  'MÁXIMA': 'MÁSSIMA',
  'máximos': 'mássimos',
  'Máximos': 'Mássimos',
  'máximas': 'mássimas',
  'Máximas': 'Mássimas',
  'maximizar': 'massimizar',
  'Maximizar': 'Massimizar',
  'maximização': 'massimização',
  'Maximização': 'Massimização',

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
export async function optimizePronunciation(text: string): Promise<string> {
  let result = text

  // ---- 0. PROCESSAR TAGS DE CONTROLE ANTES DE TUDO ----
  result = processControlTags(result)

  // ---- 1. ARTIGOS APÓS PONTUAÇÃO ----
  // DESATIVADO: O chunking agora gera cada frase separadamente.
  // Não precisamos mais trocar ". O" por ", o" porque cada frase vai pro TTS isolada.
  // Manter a pontuação intacta para o chunker criar as pausas corretas.
  // (Antes: ". O sistema" → ", o sistema" — isso UNIA frases e destruía os chunks)

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
  // ATENÇÃO: Não remover H de palavras que estão no dicionário (ex: "Hello" → dicionário vira "relou")
  // Verificar tanto palavra completa quanto prefixos (para "Hugging Face" → "hugging" deve ser protegido)
  result = result.replace(/\b[Hh]([aeiouáàãâéèêíïóôõúü][a-zA-Záàãâéèêíïóôõúüç]*)/g, (match, rest) => {
    // Se a palavra está no dicionário (inglês/marcas), manter intacta
    const lower = match.toLowerCase()
    if (H_DICT_WORDS.has(lower)) return match
    // Verificar se é o início de uma palavra multi-word protegida (ex: "Hugging" em "Hugging Face")
    if ([...H_DICT_WORDS].some(w => w.startsWith(lower + ' '))) return match
    // Senão, remover o H mudo
    return rest
  })

  // ---- 1e. ACENTUAÇÃO FORÇADA (STRESS DICTIONARY) ----
  // Adiciona acentos em palavras que o TTS pronuncia com sílaba tônica errada.
  // Ex: "publico" → "público", "tambem" → "também", "video" → "vídeo"
  // Isso guia o modelo para colocar o stress na sílaba correta.
  // IMPORTANTE: Usar word boundary (\b) para não trocar substrings.
  // Usar flag 'gi' (global + case insensitive) para cobrir variações de caixa.
  for (const [word, accented] of Object.entries(STRESS_DICTIONARY)) {
    // Pular entradas onde a palavra já tem acento (no-op de reforço)
    if (word === accented) continue
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), accented)
  }

  // ---- 2. UNIDADES DE MEDIDA (antes de converter números!) ----
  // IMPORTANTE: Deve rodar ANTES do step 3 (números) para poder capturar
  // o número ainda como dígito. Ex: "1.200 kg" → "[mil e duzentos] quilogramas"
  // Se rodar depois, "1.200" vira "[mil e duzentos]" e o "kg" fica órfão.
  const UNITS: Record<string, string> = {
    'kg': 'quilogramas', 'kgf': 'quilogramas-força',
    'g': 'gramas', 'mg': 'miligramas', 'ug': 'microgramas', 'μg': 'microgramas',
    'km': 'quilômetros', 'hm': 'hectômetros', 'dam': 'decâmetros',
    'm': 'metros', 'dm': 'decímetros', 'cm': 'centímetros', 'mm': 'milímetros',
    'km²': 'quilômetros quadrados', 'km2': 'quilômetros quadrados',
    'm²': 'metros quadrados', 'm2': 'metros quadrados',
    'cm²': 'centímetros quadrados', 'ha': 'hectares',
    'l': 'litros', 'ml': 'mililitros', 'dl': 'decilitros',
    'w': 'watts', 'kw': 'quilowatts', 'mw': 'megawatts',
    'kwh': 'quilowatts-hora', 'kWh': 'quilowatts-hora',
    'hpa': 'hectopascais', 'pa': 'pascais', 'atm': 'atmosferas',
    '°c': 'graus celsius', '°f': 'graus fahrenheit', '°k': 'graus kelvin',
    'kb': 'quilobytes', 'mb': 'megabytes', 'gb': 'gigabytes', 'tb': 'terabytes',
    'kbps': 'quilobits por segundo', 'mbps': 'megabits por segundo',
    'rpm': 'rotações por minuto', 'hz': 'hertz', 'khz': 'quilohertz', 'mhz': 'megahertz', 'ghz': 'gigahertz',
    'ms': 'milissegundos', 'μs': 'microssegundos', 'ns': 'nanossegundos',
    'km/h': 'quilômetros por hora', 'kmh': 'quilômetros por hora',
    'm/s': 'metros por segundo', 'mph': 'milhas por hora',
  }

  // Pattern: número + espaço + unidade
  const unitKeys = Object.keys(UNITS).sort((a, b) => b.length - a.length)
  const unitPattern = new RegExp(
    '(\\d[\\d.,]*\\d|\\d)\\s*(' +
    unitKeys.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')(?=\\s|[,;.!?)]|$)',
    'gi'
  )
  result = result.replace(unitPattern, (match, numStr, unit) => {
    const unitLower = unit.toLowerCase().replace(/\s/g, '')
    const unitText = UNITS[unitLower]
    if (!unitText) return match
    const numClean = numStr.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(numClean)
    if (isNaN(n)) return match
    const numWords = n === Math.floor(n) && n <= 999999999
      ? numberToWords(n)
      : numStr
    return `[${numWords}] ${unitText}`
  })

  // Unidades sozinhas (só 3+ letras para evitar falsos positivos com "m", "g", "l")
  const SAFE_LONE_UNITS = unitKeys.filter(u => u.length >= 3)
  if (SAFE_LONE_UNITS.length > 0) {
    const loneUnitPattern = new RegExp(
      '\\s+(' + SAFE_LONE_UNITS.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=\\s|[,;.!?)]|$)',
      'gi'
    )
    result = result.replace(loneUnitPattern, (match, unit) => {
      const unitLower = unit.toLowerCase().replace(/\s/g, '')
      const unitText = UNITS[unitLower]
      if (!unitText) return match
      return ` ${unitText}`
    })
  }

  // ============================================================
  // PADRÕES ESPECÍFICOS COM NÚMEROS — ANTES DOS GENÉRICOS
  // Regra: padrão mais específico primeiro, genérico por último
  // ============================================================

  // ---- 3a. VALORES MONETÁRIOS ----
  // FIX: Regex alternativa longa PRIMEIRO (milhões antes de mil)
  // Antes: '(mil|milhões)' → 'mil' casava nos 3 primeiros chars de 'milhões' → '[dois dólares mil]ões'
  result = result.replace(/R\$\s*([\d.,]+)\s*(trilh[oõ]es|bilh[oõ]es|milh[oõ]es|mil)?/gi, (match, val, mult) => {
    const cleanVal = val.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(cleanVal)
    if (isNaN(n)) return match
    let totalN = n
    if (mult) {
      const multLower = mult.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (multLower.startsWith('trilh')) totalN = n * 1e12
      else if (multLower.startsWith('bilh')) totalN = n * 1e9
      else if (multLower.startsWith('milh')) totalN = n * 1e6
      else if (multLower === 'mil') totalN = n * 1e3
    }
    const totalInt = Math.floor(totalN)
    const cents = Math.round((totalN - totalInt) * 100)
    let result = ''
    if (totalInt === 0 && cents === 0) { result = 'zero reais' }
    else if (totalInt === 1) { result = 'um real' }
    else if (totalInt > 1 && totalInt <= 999999999) { result = numberToWords(totalInt) + ' reais' }
    else if (totalInt > 999999999) { result = totalN.toLocaleString('pt-BR') + ' reais' }
    else { result = totalN.toLocaleString('pt-BR') + ' reais' }
    if (cents > 0) {
      result += cents === 1 ? ' e um centavo' : ` e ${numberToWords(cents)} centavos`
    }
    return `[${result}]`
  })
  result = result.replace(/(?:US\$|\$)\s*([\d.,]+)\s*(trilh[oõ]es|bilh[oõ]es|milh[oõ]es|mil)?/gi, (match, val, mult) => {
    const clean = val.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    if (isNaN(n)) return match
    let totalN = n
    if (mult) {
      const multLower = mult.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (multLower.startsWith('trilh')) totalN = n * 1e12
      else if (multLower.startsWith('bilh')) totalN = n * 1e9
      else if (multLower.startsWith('milh')) totalN = n * 1e6
      else if (multLower === 'mil') totalN = n * 1e3
    }
    const totalInt = Math.floor(totalN)
    let result: string
    if (totalInt === 1) { result = 'um dólar' }
    else if (totalInt > 1 && totalInt <= 999999999) { result = numberToWords(totalInt) + ' dólares' }
    else { result = totalN.toLocaleString('pt-BR') + ' dólares' }
    return `[${result}]`
  })

  // ---- 3b. PORCENTAGENS (inteiros E decimais) ----
  // FIX: Antes só convertia inteiros. 89,3% ficava como '[oitenta e nove vírgula três]%'
  result = result.replace(/(\d+(?:[,.]\d+)?)(?:\s*%|\s*por cento)/gi, (match, numStr) => {
    const clean = numStr.replace(',', '.')
    const n = parseFloat(clean)
    if (isNaN(n)) return match
    const nInt = Math.floor(n)
    const nFrac = Math.round((n - nInt) * 100)
    if (n === nInt && nInt <= 999999999) {
      // Inteiro: '65%' → '[sessenta e cinco por cento]'
      return `[${numberToWords(nInt)} por cento]`
    }
    if (nFrac > 0 && nInt <= 999999999) {
      // Decimal: '89,3%' → '[oitenta e nove vírgula três por cento]'
      const intPart = nInt > 0 ? numberToWords(nInt) : 'zero'
      const fracPart = numberToWords(nFrac)
      return `[${intPart} vírgula ${fracPart} por cento]`
    }
    return match
  })

  // ---- 3c. TELEFONES ----
  result = result.replace(/\((\d{2})\)\s*(\d{4,5})-?(\d{4})/g, (match, ddd, prefix, suffix) => {
    const dddWord = `[${numberToWords(parseInt(ddd))}]`
    const prefixDigits = prefix.split('').map(d => numberToWords(parseInt(d))).join(' ')
    const suffixDigits = suffix.split('').map(d => numberToWords(parseInt(d))).join(' ')
    return `${dddWord} [${prefixDigits}] [${suffixDigits}]`
  })
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

  // ---- 3d. DATAS ----
  const MONTHS: Record<string, string> = {
    '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
    '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
    '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro',
  }
  result = result.replace(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/g, (match, day, month, year) => {
    const d = parseInt(day); const m = MONTHS[month]; const y = parseInt(year)
    if (d >= 1 && d <= 31 && m && y >= 1000) return `[${numberToWords(d)} de ${m} de ${numberToWords(y)}]`
    return match
  })
  result = result.replace(/\b(\d{1,2})\/(\d{2})\b/g, (match, day, month) => {
    const d = parseInt(day); const m = MONTHS[month]
    if (d >= 1 && d <= 31 && m) return `[${numberToWords(d)} de ${m}]`
    return match
  })

  // ---- 3e-0. NÚMEROS NEGATIVOS ----
  result = result.replace(/(-)\s*(\d[\d.,]*\d|\d)(?=\s|$|[,;.!?°)])/g, (match, minus, numStr) => {
    const clean = numStr.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    if (isNaN(n)) return match
    if (n === Math.floor(n) && n <= 999999999) {
      return `[menos ${numberToWords(n)}]`
    }
    return `[menos ${numStr}]`
  })

  // ---- 3e-0a. PLACARES ESPORTIVOS (N x N) ----
  // Ex: "2x1", "3 X 0", "2 a 1" — lê como "dois a um"
  result = result.replace(/\b(\d+)\s*[xX]\s*(\d+)\b/g, (match, n1, n2) => {
    return `[${numberToWords(parseInt(n1))}] a [${numberToWords(parseInt(n2))}]`
  })

  // ---- 3e-0b. TEMPERATURA SEM SÍMBOLO ° ----
  // Ex: "72 graus fahrenheit", "0 graus celsius", "38 graus"
  result = result.replace(/\b(\d+)\s*graus?\s*(celsius|fahrenheit|kelvin|centígrados)?/gi, (match, numStr, scale) => {
    const n = parseInt(numStr)
    if (isNaN(n)) return match
    const scaleMap: Record<string, string> = {
      'celsius': 'graus celsius', 'fahrenheit': 'graus fahrenheit',
      'kelvin': 'graus kelvin', 'centígrados': 'graus centígrados',
    }
    const numWords = (n >= 0 && n <= 999999999) ? numberToWords(n) : numStr
    const scaleText = scale ? scaleMap[scale.toLowerCase()] || `graus ${scale.toLowerCase()}` : 'graus'
    return `[${numWords}] ${scaleText}`
  })

  // ---- 3e-0c. NÚMEROS ROMANOS ----
  // Ex: "Capítulo IV", "Papa Francisco I", "Seção II", "Rei Henrique VIII"
  // Apenas romanos I-XIX e múltiplos de X até XX (mais comuns em PT-BR)
  const ROMAN_TO_ORDINAL: Record<string, string> = {
    'I': 'primeiro', 'II': 'segundo', 'III': 'terceiro', 'IV': 'quarto',
    'V': 'quinto', 'VI': 'sexto', 'VII': 'sétimo', 'VIII': 'oitavo',
    'IX': 'nono', 'X': 'décimo', 'XI': 'décimo primeiro', 'XII': 'décimo segundo',
    'XIII': 'décimo terceiro', 'XIV': 'décimo quarto', 'XV': 'décimo quinto',
    'XVI': 'décimo sexto', 'XVII': 'décimo sétimo', 'XVIII': 'décimo oitavo',
    'XIX': 'décimo nono', 'XX': 'vigésimo',
  }
  // Detectar romanos após palavras-título
  const ROMAN_TITLES = /(?:capítulo|capitulo|seção|seccao|parte|tomo|volume|vol|livro|papa|rei|rainha|imperador|imperatriz|presidente|diretor|santo|santa|doutor|professor|congresso|artigo|art|lei|emenda|parágrafo|inciso|alínea)\s+(I{1,3}|IV|V|VI{0,3}|IX|X{1,3}|XIV|XV|XVI{0,3}|XIX|XX)/gi
  result = result.replace(ROMAN_TITLES, (match, title, roman) => {
    const ordinal = ROMAN_TO_ORDINAL[roman.toUpperCase()]
    if (ordinal) return `${title} [${ordinal}]`
    return match
  })

  // ---- 3e-0d. CEP (XXXXX-XXX) — soletrar dígito por dígito ----
  result = result.replace(/\b(\d{5})-(\d{3})\b/g, (match, p1, p2) => {
    const spell = (p1 + p2).split('').map(d => numberToWords(parseInt(d))).join(' ')
    return `[${spell}]`
  })

  // ---- 3e-0e. PLACAS DE VEÍCULOS ----
  // Formato antigo: ABC-1234, Mercosul: ABC1D23
  // Nomes fonéticos das letras em PT-BR (alfabeto completo)
  const LETTER_NAMES: Record<string, string> = {
    'A': 'á', 'B': 'bê', 'C': 'cê', 'D': 'dê', 'E': 'é',
    'F': 'éfe', 'G': 'gê', 'H': 'agá', 'I': 'í', 'J': 'jota',
    'K': 'cá', 'L': 'éle', 'M': 'ême', 'N': 'ène', 'O': 'ó',
    'P': 'pê', 'Q': 'quê', 'R': 'érre', 'S': 'ésse', 'T': 'tê',
    'U': 'ú', 'V': 'vê', 'W': 'dábliu', 'X': 'xís', 'Y': 'ípsilon', 'Z': 'zê'
  }
  const spellLetter = (l: string) => LETTER_NAMES[l] || l

  result = result.replace(/\b([A-Z]{3})-(\d{4})\b/g, (match, letters, digits) => {
    const spellLetters = letters.split('').map(spellLetter).join(' ')
    const spellDigits = digits.split('').map(d => numberToWords(parseInt(d))).join(' ')
    return `[${spellLetters}] [${spellDigits}]`
  })
  result = result.replace(/\b([A-Z]{3})(\d)([A-Z])(\d{2})\b/g, (match, l1, d1, l2, d2) => {
    const spellL1 = l1.split('').map(spellLetter).join(' ')
    const spellL2 = spellLetter(l2)
    return `[${spellL1}] [${numberToWords(parseInt(d1))}] [${spellL2}] [${d2.split('').map(d => numberToWords(parseInt(d))).join(' ')}]`
  })

  // ---- 3e-0f. APROXIMAÇÃO (~N) ----
  result = result.replace(/~\s*(\d[\d.,]*\d|\d)/g, (match, numStr) => {
    const clean = numStr.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    if (isNaN(n)) return match
    if (n === Math.floor(n) && n <= 999999999) {
      return `[aproximadamente ${numberToWords(n)}]`
    }
    return `[aproximadamente ${numStr}]`
  })

  // ---- 3e. HORÁRIOS ----
  result = result.replace(/(\d{1,2})h(\d{2})(?:min)?/gi, (match, hourStr, minStr) => {
    const h = parseInt(hourStr); const m = parseInt(minStr)
    if (h < 0 || h > 23 || m < 0 || m > 59) return match
    let text = `[${numberToWords(h)}] horas`
    if (m > 0) text += ` e [${numberToWords(m)}] minutos`
    return text
  })
  result = result.replace(/(\d{1,2})\s*h(?!\w)/gi, (match, numStr) => {
    const n = parseInt(numStr)
    if (isNaN(n) || n < 0 || n > 23) return match
    return `[${numberToWords(n)}] horas`
  })
  result = result.replace(/\b(\d{1,2}):(\d{2})\b/g, (match, hourStr, minStr) => {
    const h = parseInt(hourStr); const m = parseInt(minStr)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && m > 0) return `[${numberToWords(h)}] horas e [${numberToWords(m)}] minutos`
    return match
  })

  // ---- 3f. ORDINAIS ----
  // Cobrir 1-20 + dezenas até 100 + centenas (PT-BR)
  const ORDINALS_MASC: Record<string, string> = {
    '1': 'primeiro', '2': 'segundo', '3': 'terceiro', '4': 'quarto',
    '5': 'quinto', '6': 'sexto', '7': 'sétimo', '8': 'oitavo',
    '9': 'nono', '10': 'décimo', '11': 'décimo primeiro', '12': 'décimo segundo',
    '13': 'décimo terceiro', '14': 'décimo quarto', '15': 'décimo quinto',
    '16': 'décimo sexto', '17': 'décimo sétimo', '18': 'décimo oitavo',
    '19': 'décimo nono', '20': 'vigésimo', '30': 'trigésimo', '40': 'quadragésimo',
    '50': 'quinquagésimo', '60': 'sexagésimo', '70': 'setuagésimo',
    '80': 'octogésimo', '90': 'nonagésimo', '100': 'centésimo',
    '200': 'ducentésimo', '300': 'trecentésimo', '400': 'quadringentésimo',
    '500': 'quingentésimo', '600': 'seiscentésimo', '700': 'septingentésimo',
    '800': 'octingentésimo', '900': 'nongentésimo', '1000': 'milésimo',
  }
  const ORDINALS_FEM: Record<string, string> = {
    '1': 'primeira', '2': 'segunda', '3': 'terceira', '4': 'quarta',
    '5': 'quinta', '6': 'sexta', '7': 'sétima', '8': 'oitava',
    '9': 'nona', '10': 'décima', '11': 'décima primeira', '12': 'décima segunda',
    '13': 'décima terceira', '14': 'décima quarta', '15': 'décima quinta',
    '16': 'décima sexta', '17': 'décima sétima', '18': 'décima oitava',
    '19': 'décima nona', '20': 'vigésima', '30': 'trigésima', '40': 'quadragésima',
    '50': 'quinquagésima', '60': 'sexagésima', '70': 'setuagésima',
    '80': 'octogésima', '90': 'nonagésima', '100': 'centésima',
    '200': 'ducentésima', '300': 'trecentésima', '400': 'quadringentésima',
    '500': 'quingentésima', '600': 'seiscentésima', '700': 'septingentésima',
    '800': 'octingentésima', '900': 'nongentésima', '1000': 'milésima',
  }

  // Padrão 1: º/ª (Unicode ordinal indicators) + lookahead para evitar falso positivo
  // Ex: "1º lugar", "3ª feira", "50º aniversário"
  result = result.replace(/(\d+)[ºª](?=\s|$|[,;.!?\)\]])/g, (match, num, suffix) => {
    const isFem = match.includes('ª')
    const dict = isFem ? ORDINALS_FEM : ORDINALS_MASC
    if (dict[num]) return `[${dict[num]}]`
    // Fallback para números > 1000: número cardinal + "ésimo/ésima"
    const n = parseInt(num)
    if (n > 0) return `[${numberToWords(n)}${isFem ? 'ésima' : 'ésimo'}]`
    return match
  })

  // Padrão 2: o/a minúsculos e maiúsculos APÓS número (sem º/ª Unicode)
  // Ex: "1o lugar", "2a via", "3O andar" (keyboard sem º)
  // IMPORTANTE: usar lookahead negativo para não capturar dentro de palavras
  result = result.replace(/(\d+)([oO])(?=\s|$|[,;.!?\)\]])/g, (match, num) => {
    if (ORDINALS_MASC[num]) return `[${ORDINALS_MASC[num]}]`
    const n = parseInt(num)
    if (n > 0) return `[${numberToWords(n)}ésimo]`
    return match
  })
  result = result.replace(/(\d+)([aA])(?=\s|$|[,;.!?\)\]])/g, (match, num) => {
    if (ORDINALS_FEM[num]) return `[${ORDINALS_FEM[num]}]`
    const n = parseInt(num)
    if (n > 0) return `[${numberToWords(n)}ésima]`
    return match
  })

  // ---- 3f2. FRAÇÕES COMUNS ----
  // Ex: "1/2" → "um meio", "3/4" → "três quartos", "1/3" → "um terço"
  const FRACTIONS: Record<string, string> = {
    '2': 'meio', '3': 'terço', '4': 'quarto', '5': 'quinto',
    '6': 'sexto', '7': 'sétimo', '8': 'oitavo', '9': 'nono', '10': 'décimo',
    '100': 'centésimo', '1000': 'milésimo',
  }
  result = result.replace(/(\d+)\/(\d+)(?=\s|$|[,;.!?\)\]])/g, (match, numStr, denStr) => {
    const num = parseInt(numStr)
    const den = parseInt(denStr)
    if (num <= 0 || den <= 0 || num > 999 || den > 1000) return match
    if (num === 1) {
      // "1/2" → "um meio", "1/3" → "um terço"
      const fracName = FRACTIONS[denStr]
      if (fracName) return `[um ${fracName}]`
      return `[um ${numberToWords(den)}avos]`
    }
    // "3/4" → "três quartos", "2/3" → "dois terços"
    const fracName = FRACTIONS[denStr]
    if (fracName) {
      // Pluralizar: "meio" → "meios", "terço" → "terços"
      const plural = fracName.endsWith('o') ? fracName.slice(0, -1) + 'os' : fracName + 's'
      return `[${numberToWords(num)} ${plural}]`
    }
    return `[${numberToWords(num)} ${numberToWords(den)}avos]`
  })

  // ============================================================
  // PADRÕES GENÉRICOS DE NÚMEROS — POR ÚLTIMO
  // ============================================================

  // ---- 4. NÚMEROS POR EXTENSO ----
  // 4a. Anos (com ou sem a palavra "ano")
  result = result.replace(/(?:ano|Ano|ANO)\s+(\d{4})/g, (match, year) => {
    const y = parseInt(year)
    if (y >= 1000 && y <= 2100) return match.replace(year, `[${numberToWords(y)}]`)
    return match
  })
  // Anos soltos: 4 dígitos que parecem ano (1900-2199)
  result = result.replace(/\b((?:19|20)\d{2})\b/g, (match, year) => {
    const y = parseInt(year)
    if (y >= 1900 && y <= 2199) return `[${numberToWords(y)}]`
    return match
  })
  // Números com separador de milhar (1.200, 100.000, etc)
  result = result.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (match) => {
    const n = parseInt(match.replace(/\./g, ''))
    if (n <= 999999999) return `[${numberToWords(n)}]`
    return match
  })
  result = result.replace(/\b(\d+),(\d+)\b/g, (match, intPart, decPart) => {
    const n = parseInt(intPart)
    if (n > 0 && n <= 999) {
      const intWord = numberToWords(n)
      const decDigits = decPart.split('').map(d => numberToWords(parseInt(d))).join(' ')
      return `[${intWord} vírgula ${decDigits}]`
    }
    return match
  })
  // Números isolados pequenos (0-999) — ABSOLUTAMENTE POR ÚLTIMO
  result = result.replace(/\b(\d{1,3})\b/g, (match, numStr) => {
    const n = parseInt(numStr)
    if (n >= 0 && n <= 999) {
      const before = result.substring(Math.max(0, result.indexOf(match) - 1), result.indexOf(match))
      if (before === '[') return match
      return `[${numberToWords(n)}]`
    }
    return match
  })

  // ---- 5. DICIONÁRIO (abreviações + siglas + estrangeirismos + problemáticas) ----
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
  // Regex não captura pontuação final (. , ; : ! ? ) ) — evita falar "ponto" sobrando
  result = result.replace(/(https?:\/\/)([^\s.,;:!?\)]+(?:\.[^\s.,;:!?\)]+)*)/gi, (match, protocol, domain) => {
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

  // ---- 12. DOMÍNIOS / EMAILS ----
  // Dicionário de pronúncia fonética para partes de domínios
  const DOMAIN_PHONETICS: Record<string, string> = {
    'xtech': 'xisték',
    'stech': 'ésseték',
    'xanxere': 'xanxere',
    'tech': 'têque',
    'dev': 'dêve',
    'web': 'uébec',
    'cloud': 'cláude',
    'app': 'épi',
    'pro': 'pró',
    'lab': 'lébe',
    'hub': 'rábe',
    'io': 'ío',
    'ai': 'ei ai',
    'info': 'ínfo',
    'gmail': 'jímeil',
    'hotmail': 'rótmeil',
    'outlook': 'áutlúque',
    'yahoo': 'yáhu',
    'live': 'láive',
    'icloud': 'aiclaude',
    'terra': 'térra',
    'uol': 'uól',
    'bol': 'bol',
    'ig': 'íge',
    'r7': 'érre sête',
    'globo': 'glóbo',
    'g1': 'gê úm',
    'google': 'gúgol',
    'github': 'gítabe',
    'gitlab': 'gítlebe',
    'bitbucket': 'bítabáquete',
    'docker': 'dóquer',
    'aws': 'a dábliu és',
    'azure': 'ézurre',
    // TLDs country codes — soletrar ao invés de pronunciar como palavra
    'br': 'bê érre',
    'com': 'com',
    'org': 'ôre gê',
    'net': 'nête',
    'edu': 'é dê u',
    'gov': 'gê ôve',
    'mil': 'mîle',
    'tv': 'tê vê',
    'me': 'mê í',
    'co': 'cê ô',
    'uk': 'iu kêi',
    'us': 'iu és',
    'de': 'dê ê',
    'fr': 'éfe erre',
    'jp': 'jota pê',
    'it': 'í ti',
    'es': 'é és',
    'ar': 'a erre',
    'mx': 'ême ixe',
    'pt': 'pê tê',
    'cl': 'cê éle',
    'uy': 'u ígreque',
    'py': 'pê ígreque',
    'pe': 'pê ê',
    'au': 'ei ú',
    'ca': 'cê ei',
    'nz': 'éne zê',
    'in': 'í êne',
    'cn': 'cê êne',
    'ru': 'erre u',
    'ch': 'cê agá',
  }

  // Função auxiliar: verificar se uma string parece pronunciável em PT-BR
  // Palavras com muitas vogais e clusters consonantais válidos → o TTS lê naturalmente
  // Strings com poucas vogais e clusters inválidos → soletrar letra por letra
  function isPronounceable(part: string): boolean {
    const alpha = part.replace(/[^a-zàáâãäéèêëíìîïóòôõöúùûü]/gi, '')
    if (alpha.length === 0) return false

    // Contar vogais
    const vowels = (alpha.match(/[aeiouàáâãäéèêëíìîïóòôõöúùûü]/gi) || []).length
    const ratio = vowels / alpha.length

    // Menos de 30% vogais → provavelmente abreviação ou string aleatória
    if (ratio < 0.3) return false

    // 4+ consoantes consecutivas → provavelmente string aleatória (ex: ggxph)
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(alpha)) return false

    // 3 consoantes consecutivas seguidas de vogal e depois 3+ consoantes → padrão aleatório
    if (/[bcdfghjklmnpqrstvwxyz]{3}[aeiouàáâãäéèêëíìîïóòôõöúùûü][bcdfghjklmnpqrstvwxyz]{3,}/i.test(alpha)) return false

    return true
  }

  // Função auxiliar: pronunciar parte de domínio
  // 1) No dicionário fonético → pronúncia fonética
  // 2) Parece palavra pronunciável → deixa o TTS ler naturalmente (entre colchetes)
  // 3) String aleatória → soletra letra por letra em PT-BR
  function pronunciarParteDominio(part: string): string {
    // 1. Dicionário fonético
    const lookup = DOMAIN_PHONETICS[part.toLowerCase()]
    if (lookup) return lookup

    // 2. Parece pronunciável → TTS lê naturalmente
    if (isPronounceable(part)) return part

    // 3. String aleatória → soletrar letra por letra
    const nomesLetras: Record<string, string> = {
      a: 'a', b: 'bê', c: 'cê', d: 'dê', e: 'e', f: 'efe', g: 'gê',
      h: 'agá', i: 'i', j: 'jota', k: 'cá', l: 'ele', m: 'ême',
      n: 'ene', o: 'o', p: 'pê', q: 'quê', r: 'erre', s: 'esse',
      t: 'tê', u: 'u', v: 'vê', w: 'dábliu', x: 'xis', y: 'ípsilon', z: 'zê',
      '0': 'zero', '1': 'um', '2': 'dois', '3': 'três', '4': 'quatro',
      '5': 'cinco', '6': 'seis', '7': 'sete', '8': 'oito', '9': 'nove',
    }
    return part.split('').map(c => {
      const lower = c.toLowerCase()
      if (nomesLetras[lower]) return nomesLetras[lower]
      return c // fallback: char original
    }).join(' ')
  }

  // www.domínio.com — não captura pontuação final
  result = result.replace(/www\.([^\s.,;:!?\)]+(?:\.[^\s.,;:!?\)]+)*)/gi, (match, domain) => {
    const parts = domain.split('.')
    const spelled = parts.map(part => pronunciarParteDominio(part)).join(' ponto ')
    return `[dábliu dábliu dábliu ponto ${spelled}]`
  })

  // Emails: user@domínio.com — não captura pontuação final
  result = result.replace(/(\S+)@([^\s.,;:!?\)]+(?:\.[^\s.,;:!?\)]+)*)/g, (match, user, domain) => {
    // Verificar se o domínio inteiro tem pronúncia fonética
    const domainLower = domain.toLowerCase()
    const phonetic = DOMAIN_PHONETICS[domainLower]
    if (phonetic) {
      return `[${user} arroba ${phonetic}]`
    }
    // Tentar pronunciar cada parte do domínio separadamente
    // Se a parte não está no dicionário → soletra letra por letra em PT-BR
    const parts = domainLower.split('.')
    const partsPhonetic = parts.map(part => pronunciarParteDominio(part)).join(' ponto ')
    return `[${user} arroba ${partsPhonetic}]`
  })

  // ---- 14. G2P FALLBACK — espeak-ng para palavras desconhecidas ----
  // Usa espeak-ng para detectar palavras que provavelmente serão pronunciadas errado
  // e que NÃO estão no dicionário. Aplica pronúncia fonética como fallback.
  // Isso cobre nomes próprios, neologismos e termos de nicho que o dicionário não cobre.
  // NOTA: G2P é executado via /api/g2p-phonemize (endpoint separado)
  // Esta camada só atua se o G2P responder — não bloqueia o pipeline se falhar.
  result = await applyG2PFallback(result)

  // ---- 15. LIMPEZA FINAL ----
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
// G2P FALLBACK — espeak-ng para palavras desconhecidas
// ============================================================

/**
 * Detecta padrões de palavras que o TTS provavelmente pronunciará errado.
 * Mesma lógica do endpoint /api/g2p-phonemize mas executada client-side.
 */
function isLikelyMispronounced(word: string): boolean {
  const w = word.replace(/[.,;:!?¿¡…"'()\[\]{}]/g, '')
  if (!w || w.length < 3) return false
  const lower = w.toLowerCase()

  // Grupos consonantais problemáticos no início (PT-BR)
  if (/^(gn|pn|mn|pt|ps|bn)/.test(lower)) return true

  // Palavras com X no início (6 sons possíveis, TTS erra maioria)
  if (/^x/i.test(lower)) return true

  // Palavras com ge/gi que TTS pode ler como G duro
  if (/[gG][eEéÉêÊiIíÍ]/.test(w) && !/^[gG]ui/.test(lower)) return true

  // Palavras com padrões típicos de inglês em texto PT
  if (/[aeiou]tion$/.test(lower)) return true
  if (/^(?:the|this|that|with|from|have|will|would|should|could|been|were|what|when|where|which|their|there|they|them|these|those|your|about)$/.test(lower)) return true

  // Palavras muito longas com padrões incomuns (neologismos, termos técnicos)
  if (w.length > 12 && /(?:qu|gu|nh|lh|ch)/.test(lower)) return true

  return false
}

/**
 * Aplica G2P fallback usando espeak-ng para palavras que provavelmente
 * serão pronunciadas errado e que NÃO estão cobertas pelo dicionário.
 *
 * Funciona de forma não-bloqueante: se o G2P não responder, retorna
 * o texto sem modificações. Nunca falha o pipeline.
 */
async function applyG2PFallback(text: string): Promise<string> {
  // Palavras já entre colchetes já têm pronúncia forçada — ignorar
  const bracketed = new Set<string>()
  text.replace(/\[([^\]]+)\]/g, (_, content) => {
    // Extrair palavras dentro de colchetes
    content.split(/\s+/).forEach(w => bracketed.add(w.toLowerCase()))
    return ''
  })

  // Encontrar palavras candidatas ao G2P
  const words = text.split(/\s+/)
  const candidates: string[] = []
  const candidateIndices: number[] = []

  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/[.,;:!?¿¡…"'()\[\]{}]/g, '')
    if (!clean || clean.length < 3) continue

    const lower = clean.toLowerCase()

    // Pular se já está entre colchetes, é número, ou está no dicionário
    if (bracketed.has(lower)) continue
    if (/^\d+$/.test(clean)) continue
    if (PRONUNCIATION_DICTIONARY[clean] || PRONUNCIATION_DICTIONARY[words[i]]) continue
    if (STRESS_DICTIONARY[lower]) continue

    // Verificar se provavelmente será pronunciada errado
    if (isLikelyMispronounced(clean)) {
      candidates.push(clean)
      candidateIndices.push(i)
    }
  }

  if (candidates.length === 0) return text

  try {
    // Chamar endpoint G2P (não-bloqueante com timeout curto)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000) // 3s max

    const res = await fetch('/api/g2p-phonemize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: candidates.join(' '), voice: 'pt-br', mode: 'words' }),
      signal: controller.signal,
    }).catch(() => null)

    clearTimeout(timeoutId)

    if (!res || !res.ok) return text

    const data = await res.json()
    if (!data.words || !Array.isArray(data.words)) return text

    // Construir mapa de pronúncias IPA
    const pronunciationMap = new Map<string, string>()
    for (const item of data.words) {
      if (item.word && item.ipa && item.ipa !== item.word) {
        pronunciationMap.set(item.word.toLowerCase(), item.ipa)
      }
    }

    // Aplicar pronúncias ao texto
    let result = text
    let offset = 0
    for (let i = 0; i < candidateIndices.length; i++) {
      const wordIdx = candidateIndices[i]
      const originalWord = candidates[i]
      const ipa = pronunciationMap.get(originalWord.toLowerCase())

      if (ipa) {
        // Substituir a palavra pela versão fonética entre colchetes
        // Converter IPA para representação legível pelo TTS
        const ttsPronunciation = ipaToTTS(ipa)
        const replacement = `[${ttsPronunciation}]`

        // Encontrar a posição da palavra no texto
        const regex = new RegExp(`\\b${originalWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        result = result.replace(regex, replacement)
      }
    }

    return result
  } catch {
    // G2P falhou — retornar texto sem modificações
    return text
  }
}

/**
 * Converte IPA para representação que o TTS consegue ler.
 * Simplifica símbolos IPA complexos para grafemas PT-BR aproximados.
 */
function ipaToTTS(ipa: string): string {
  return ipa
    // Remover símbolos que o TTS não lê
    .replace(/[ˈˌː̃ˑ.]/g, '')
    // Vogais com acento IPA → vogais PT-BR simples
    .replace(/ɛ/g, 'e')
    .replace(/ɔ/g, 'o')
    .replace(/ɑ/g, 'a')
    .replace(/ɪ/g, 'i')
    .replace(/ʊ/g, 'u')
    .replace(/ʒ/g, 'j')
    .replace(/ʃ/g, 'x')
    .replace(/ɲ/g, 'nh')
    .replace(/ʎ/g, 'lh')
    .replace(/ʁ/g, 'r')
    .replace(/ɐ/g, 'a')
    .replace(/ø/g, 'e')
    .replace(/y/g, 'u')
    // Limpar duplicados
    .replace(/(.)\1+/g, '$1')
    .trim()
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
