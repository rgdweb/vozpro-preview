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
  'DVD': '[dê vê dê]',
  'GPS': '[gê pê és]',
  'IPTU': '[i pê tê u]',
  'INSS': '[i êne és és]',
  'URL': '[u erre éle]',
  'PDF': '[pê dê éfe]',
  'HTML': '[agá tê ême éle]',
  'CSS': '[cê és és]',
  'CRM': '[cê erre ême]',
  'CNPJ': '[cê êne pê jota]',
  'CPF': '[cê pê éfe]',
  'RG': '[erre gê]',
  'IMC': '[i ême cê]',
  'DVDs': '[dê vê dês]',
  'CEP': '[cê ê pê]',
  'CNPJs': '[cê êne pê jotas]',
  'CPFs': '[cê pê és]',
  'PIB': '[pê i bê]',
  'PIBC': '[pê i bê cê]',
  'SUV': '[ês u vê]',
  'IBGE': '[i bê gê i]',
  'PNG': '[pê êne gê]',
  'JPG': '[jota pê gê]',
  'GIF': '[gife]',
  'USB': '[u és bê]',
  'Wi-Fi': '[uái fái]',
  'wifi': '[uái fái]',
  'WiFi': '[uái fái]',
  '3D': '[três dê]',
  '4D': '[quatro dê]',
  '5G': '[quinto gê]',
  '4G': '[quarto gê]',
  'HD': '[agá dê]',
  'SSD': '[ês és dê]',

  // === ESTRANGEIRISMOS COMUNS (pronúncia aportuguesada) ===
  'marketing': '[marqueting]',
  'Marketing': '[Marqueting]',
  'MARKETING': '[MARQUETING]',
  'download': '[daunloud]',
  'Download': '[Daunloud]',
  'upload': '[aploud]',
  'Upload': '[Aploud]',
  'software': '[softeuér]',
  'Software': '[Softeuér]',
  'hardware': '[ardeuér]',
  'Hardware': '[Ardeuér]',
  'mouse': '[mause]',
  'Mouse': '[Mause]',
  'link': '[linque]',
  'Link': '[Linque]',
  'links': '[linques]',
  'Links': '[Linques]',
  // REMOVIDO: login (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Login (instrucao [fonema] causava erro no TTS)
  'logout': '[logoúte]',
  'Logout': '[Logoúte]',
  'online': '[onlaine]',
  'Online': '[Onlaine]',
  'offline': '[offlaine]',
  'Offline': '[Offlaine]',
  'browser': '[brauzér]',
  'Browser': '[Brauzér]',
  'app': '[épe]',
  'App': '[Épe]',
  'apps': '[épes]',
  'Apps': '[Épes]',
  'startup': '[startape]',
  'Startup': '[Startape]',
  'feedback': '[fidebáque]',
  'Feedback': '[Fidebáque]',
  'layout': '[leiáute]',
  'Layout': '[Leiáute]',
  'design': '[dizaine]',
  'Design': '[Dizaine]',
  'sprint': '[esprinte]',
  'Sprint': '[Esprinte]',
  'benchmark': '[benchmarque]',
  'Benchmark': '[Benchmarque]',
  'hacker': '[râquer]',
  'Hacker': '[Râquer]',
  'podcast': '[podcáste]',
  'Podcast': '[Podcáste]',
  'vlog': '[vlogue]',
  'Vlog': '[Vlogue]',
  'blog': '[blogue]',
  'Blog': '[Blogue]',
  'e-commerce': '[comércio eletrônico]',
  'e-mail': '[imeil]',
  'email': '[imeil]',
  'E-mail': '[Imeil]',
  'site': '[sáite]',
  'Site': '[Sáite]',
  'smartphone': '[smartifone]',
  'Smartphone': '[Smartifone]',
  // REMOVIDO: selfie (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Selfie (instrucao [fonema] causava erro no TTS)
  'hashtag': '[rastague]',
  'Hashtag': '[Rastague]',
  'influencer': '[influenser]',
  'Influencer': '[Influenser]',
  'live': '[laive]',
  'Live': '[Laive]',
  'streaming': '[estrimingue]',
  'Streaming': '[Estrimgue]',
  'know-how': '[nou rau]',
  'showroom': '[chorume]', // aportuguesado
  'background': '[bécigraunde]',
  'framework': '[freimeuorquê]',
  'office': '[ófice]',
  'Office': '[Ófice]',
  'business': '[biznise]',
  'performance': '[perfománsse]',
  'standard': '[stándarde]',
  'ranking': '[ranquingue]',
  'tester': '[téster]',
  'manager': '[manájer]',
  'partner': '[pártenér]',
  'delivery': '[delivéri]',
  'coffee': '[cófi]',
  'break': '[breique]',
  'meeting': '[mitingue]',

  'home': '[roume]',
  'upgrade': '[apgreide]',
  'downgrade': '[daungreide]',
  'backup': '[bécape]',
  'chip': '[tchip]',
  'byte': '[baite]',
  'pixel': '[píxél]',
  'click': '[clique]',
  'touch': '[tatx]',
  'display': '[displei]',
  'storage': '[estorage]',
  'server': '[servér]',
  'router': '[raúter]',
  'switch': '[suitx]',
  'patch': '[pétch]',
  'hug': '[rague]',
  'spray': '[espréi]',
  'sticker': '[stiquér]',
  'flag': '[flague]',
  'kit': '[quité]',
  'Premium': '[Prêmium]',
  'premium': '[prêmium]',
  'VIP': '[vipe]',
  'vip': '[vipe]',
  'outlet': '[aulete]',
  'smart': '[smarte]',
  'factory': '[fáctore]',
  'outdoor': '[aútedor]',
  'drive-thru': '[draive tru]',
  'play': '[plei]',
  'stop': '[stope]',
  'start': '[starte]',
  'fast': '[fáste]',
  'food': '[fude]',
  'center': '[senter]',
  'shopping': '[choping]',
  'fitness': '[fitnes]',
  'personal': '[perssonal]',
  'trainer': '[treiner]',
  'crossfit': '[crosfite]',
  'boot': '[bute]',
  'bootcamp': '[butecampe]',
  'coding': '[codingue]',
  'debug': '[dibague]',
  'deploy': '[diploy]',
  'commit': '[comite]',
  'token': '[toquên]',
  // REMOVIDO: cache (instrucao [fonema] causava erro no TTS)
  'cookies': '[cúquis]',
  'script': '[escripte]',
  'prompt': '[prompete]',
  'bot': '[bote]',
  'chat': '[chate]',
  'share': '[chere]',
  'like': '[laique]',
  'post': '[póste]',
  'tag': '[tegue]',
  'viral': '[vairal]',
  'hype': '[raipe]',
  'geek': '[guique]',
  'nerd': '[nerde]',
  'pop': '[pope]',
  'rock': '[roque]',
  'jazz': '[jázze]',
  'blues': '[blúze]',
  'remix': '[remixe]',
  'featuring': '[fiuturinge]',
  'rapper': '[reper]',
  'gameplay': '[gemeplei]',
  'gameover': '[geme ouver]',
  'e-sports': '[isportes]',
  'esports': '[isportes]',
  'score': '[escóre]',
  'goal': '[gole]',
  'penalti': '[penalte]',
  'shoot': '[chute]',
  'match': '[metxe]',
  'round': '[raunde]',
  'set': '[sete]',

  // === ABREVIAÇÕES (expandir) ===
  'Sr.': '[Senhor]',
  'Sra.': '[Senhora]',
  'Srta.': '[Senhorita]',
  'Dr.': '[Doutor]',
  'Dra.': '[Doutora]',
  'Prof.': '[Professor]',
  'Profa.': '[Professora]',
  'Gov.': '[Governador]',
  'Govª.': '[Governadora]',
  'Av.': '[Avenida]',
  'R.': '[Rua]',
  'Pça.': '[Praça]',
  'Ltda.': '[Limitada]',
  'S/A': '[Sociedade Anônima]',
  'MEI': '[Microempreendedor Individual]',
  'ME': '[Microempresa]',
  'EPP': '[Empresa de Pequeno Porte]',
  'Vol.': '[Volume]',
  'Cap.': '[Capítulo]',
  'Pág.': '[Página]',
  'Tel.': '[Telefone]',
  'Ref.': '[Referência]',
  'Obs.': '[Observação]',
  'Exmo.': '[Excelentíssimo]',
  'Exma.': '[Excelentíssima]',
  'Ilmo.': '[Ilustríssimo]',
  'Ilma.': '[Ilustríssima]',
  'V.Exa.': '[Vossa Excelência]',
  'V.Sa.': '[Vossa Senhoria]',
  'Att.': '[Atenciosamente]',
  'Cia.': '[Companhia]',
  'Deptº': '[Departamento]',
  'Min.': '[Ministro]',
  'Maj.': '[Major]',
  'Cel.': '[Coronel]',
  'Gen.': '[General]',
  'Emb.': '[Embaixador]',

  // === PALAVRAS PROBLEMÁTICAS ESPECÍFICAS DO TTS ===
  // O VozPro/F5-TTS frequentemente pronuncia estas errado
  // CONSOANTES MUDAS — o modelo DROPA o P/C inicial
  'pneu': '[peneu]',
  'Pneu': '[Peneu]',
  'pneus': '[peneus]',
  'Pneus': '[Peneus]',
  'pneumonia': '[peneumonia]',
  'Pneumonia': '[Peneumonia]',
  'pneumonita': '[peneumonite]',
  'Pneumonita': '[Peneumonite]',
  'pneumático': '[peneumático]',
  'Pneumático': '[Peneumático]',
  'pneumotórax': '[peneumotórax]',
  // REMOVIDO: psicólogo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Psicólogo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: psiquiatra (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Psiquiatra (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: psicose (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: psicopata (instrucao [fonema] causava erro no TTS)
  'ptialismo': '[petialismo]',
  'Ptialismo': '[Petialismo]',
  'ptose': '[petose]',
  'gnomo': '[nomo]',
  'Gnomo': '[Nomo]',
  'gnose': '[nose]',
  'Gnose': '[Nose]',
  'gnóstico': '[nóstico]',
  'mnemônico': '[nemônico]',
  'Mnemônico': '[Nemônico]',
  'mnemônica': '[nemônica]',
  'cpt': '[cê pê tê]',
  'CPT': '[cê pê tê]',

  // H MUDO — o modelo lê como se tivesse som
  // FIX: removido [fonema] porque causava erro no TTS (falava literalmente os colchetes)
  // Agora usa texto puro — o TTS lê a palavra sem H naturalmente
  'hidráulico': 'idráulico',
  'Hidráulico': 'Idráulico',
  'humor': 'umor',
  'Humor': 'Umor',
  'homicídio': 'omicídio',
  'Homicídio': 'Omicídio',
  'homem': 'omem',
  'Homem': 'Omem',
  'hora': 'ora',
  'Hora': 'Ora',
  'hoje': 'oje',
  'Hoje': 'Oje',
  'hotel': 'otel',
  'Hotel': 'Otel',
  'hierarquia': 'ierarquia',
  'Hierarquia': 'Ierarquia',
  'hernia': 'érnia',
  'Hérnia': 'Érnia',
  'habilidade': 'abilidade',
  'história': 'istória',
  'História': 'Istória',
  'herança': 'erança',
  'Herança': 'Erança',

  // OUTRAS PALAVRAS PROBLEMÁTICAS
  // REMOVIDO: automóvel (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Automóvel (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: automóveis (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Automóveis (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ecocardiograma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: transesofágico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: estenose (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: adenocarcinoma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: eletroencefalograma (instrucao [fonema] causava erro no TTS)
  'hemodiálise': '[emodiálise]',
  // REMOVIDO: azitromicina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: omeprazol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dipirona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ressonância (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: metástase (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: aneurisma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: insuficiência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: biópsia (instrucao [fonema] causava erro no TTS)

  // === NOMES PRÓPRIOS DIFÍCEIS ===
  'Wolski': '[Volski]',
  'Kowalski': '[Covalski]',
  'Higashi': '[Rigaxi]',
  'Schütz': '[Xuts]',
  // REMOVIDO: Constança (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Ilhéus (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Niterói (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Teotônio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Xangai (instrucao [fonema] causava erro no TTS)
  'Yngrid': '[Ingrid]',
  "L'Oréal": '[Loreal]',

  // === MARCAS / NEGÓCIOS (expansão Fase 1) ===
  // REMOVIDO: Walmart (instrucao [fonema] causava erro no TTS)
  'Carrefour': '[Carrefur]',
  // REMOVIDO: Nestlé (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Unilever (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Google (instrucao [fonema] causava erro no TTS)
  'Apple': '[Épel]',
  'Microsoft': '[Maicrósofte]',
  'Amazon': '[Amazônia]',
  // REMOVIDO: Mercado Livre (instrucao [fonema] causava erro no TTS)
  'Magazine Luiza': '[Magazine Luíza]',
  // REMOVIDO: Casas Bahia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Americanas (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Saraiva (instrucao [fonema] causava erro no TTS)
  'C&A': '[Cê e Á]',
  'HP': '[Agá Pê]',
  'Dell': '[Del]',
  'IBM': '[I Agá Bê Emme]',
  // REMOVIDO: Intel (instrucao [fonema] causava erro no TTS)
  'AMD': '[A Éme Dê]',
  'Foxconn': '[Focsone]',
  // REMOVIDO: Uber (instrucao [fonema] causava erro no TTS)
  'Airbnb': '[Ér en bi en bi]',
  'iFood': '[i fude]',
  'Nubank': '[Nubanke]',
  'PicPay': '[PicPei]',
  // REMOVIDO: Mercado Pago (instrucao [fonema] causava erro no TTS)
  'Renner': '[Réner]',
  'Herbalife': '[Erbaife]',
  'Avon': '[Avone]',
  // REMOVIDO: Natura (instrucao [fonema] causava erro no TTS)
  'ODONTOPREV': '[Odôntoprêve]',
  'UNIMED': '[Unimede]',
  // REMOVIDO: SulAmérica (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Porto Seguro (instrucao [fonema] causava erro no TTS)
  'Bradesco': '[Bradésco]',
  // REMOVIDO: Itaú (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Santander (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Banco do Brasil (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Caixa (instrucao [fonema] causava erro no TTS)
  'Renault': '[Renô]',
  'Fiat': '[Fiate]',
  'Chevrolet': '[Chevrólet]',
  'Volkswagen': '[Folquesvágue]',
  // REMOVIDO: Toyota (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Honda (instrucao [fonema] causava erro no TTS)
  'Hyundai': '[Rundai]',
  'Peugeot': '[Pejô]',
  'Citroën': '[Citroen]',
  'Jeep': '[Jipe]',
  'Land Rover': '[Lande Rover]',

  // === TECNOLOGIA (expansão Fase 1) ===
  'TikTok': '[TíTóque]',
  // REMOVIDO: YouTube (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Instagram (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Facebook (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: WhatsApp (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Twitter (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Netflix (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Spotify (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Telegram (instrucao [fonema] causava erro no TTS)
  'Discord': '[Discorde]',
  // REMOVIDO: Slack (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Zoom (instrucao [fonema] causava erro no TTS)
  'Skype': '[Scaipe]',
  // REMOVIDO: Pinterest (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: LinkedIn (instrucao [fonema] causava erro no TTS)
  'Twitch': '[Tuitx]',
  // REMOVIDO: Samsung (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Xiaomi (instrucao [fonema] causava erro no TTS)
  'LG': '[Éle Gê]',
  // REMOVIDO: Philips (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Canon (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Nikon (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Epson (instrucao [fonema] causava erro no TTS)
  'Brother': '[Bráder]',
  'JBL': '[Jota Bê Éle]',
  'Logitech': '[Lodjiteque]',
  'Razer': '[Réizer]',
  'Corsair': '[Corsér]',
  'Bluetooth': '[Blutuuce]',
  'Ethernet': '[Érnet]',
  'QR Code': '[quér code]',
  // REMOVIDO: Excel (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: PowerPoint (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Word (instrucao [fonema] causava erro no TTS)
  'Windows': '[Uíndeus]',
  // REMOVIDO: Linux (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Android (instrucao [fonema] causava erro no TTS)
  'iOS': 'i O S',
  'SQL': 'S Q L',

  // === SAÚDE / MEDICAMENTOS (expansão Fase 1) ===
  // REMOVIDAS instruções [fonema] — VozPro lia literalmente e falava errado
  // ex: colesterol era [colesteróle] e o TTS falava "colesteróle"
  'hipertensão': 'ipertensão',
  'AVC': 'A V Cê',
  'HIV': 'H I V',
  'omicrânio': 'omicron',
  'insuficiência renal': 'insuficiência renal',

  // === ALIMENTAÇÃO (expansão Fase 1) ===
  'açaí': 'assai',
  // REMOVIDO: empadão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: coxinha (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: brigadeiro (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: beijinho (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: pão de queijo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tapioca (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: acarajé (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: moqueca (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: feijoada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: caruru (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: quindim (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: pudim (instrucao [fonema] causava erro no TTS)
  'paçoca': '[passoca]',
  // REMOVIDO: pé de moleque (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: rapadura (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: guaraná (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: caipirinha (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cachaça (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: caldinho (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: farofa (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: pirão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: macarronada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: escondidinho (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: galinhada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: jabá (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tucumã (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: jambu (instrucao [fonema] causava erro no TTS)

  // === GERAL / OUTROS (expansão Fase 1) ===
  'QR code': '[cúder code]',
  'CEO': '[cê e i ó]',
  'CFO': '[cê éfe ó]',
  'CTO': '[cê tê ó]',
  'RH': '[erre águe]',
  'PK': '[pê cá]',
  'NGO': '[ênge ô]',
  'GPT': '[gê pê tê]',
  'LLM': '[éle éleême]',
  'SSR': '[és és ér]',
  'VPN': '[vê pê éne]',
  'LAN': '[éle águe éne]',
  'RAM': '[erre águe éme]',
  'ROM': '[erre ó éme]',
  'BI': '[bê i]',
  'DB': '[dê bê]',
  'SaaS': '[sáce]',
  'IoT': '[i ó tê]',
  'B2B': '[bê dois bê]',
  'B2C': '[bê dois cê]',
  'freelancer': '[frilenser]',
  'stackoverflow': '[stack ouverflou]',
  'github': '[giteube]',
  'GitHub': '[Giteube]',
  'reddit': '[rédite]',
  'screenshot': '[screnshote]',
  'shareware': '[xérueér]',
  'open-source': '[ópen sourse]',
  'docker': '[dóquer]',
  'kubernetes': '[kubernétes]',
  'wordpress': '[uórdpress]',
  'woocommerce': '[uócomérce]',
  'shopify': '[xópifei]',
  'chatbot': '[chatebote]',
  'IA': '[i á]',
  'PC': '[pê cê]',
  'TV': '[tê vê]',
  'CNPJ': '[cê ene pê jota]',
  'CPF': '[cê pê éfe]',
  'PIS': '[pê i esse]',
  'PASEP': '[pá sêpe]',
  'FGTS': '[éfe gê tê esse]',
  'INSS': '[i éne esse esse]',
  'IRPF': '[i erre pê éfe]',
  'IRPJ': '[i erre pê jota]',
  'ICMS': '[i cê éme esse]',
  'ISSQN': '[i esse esse quê éne]',
  'SIMPLES': '[símples]',
  'NF-e': '[éne éfe e]',
  'CT-e': '[cê tê e]',
  'MDF-e': '[éme dê éfe e]',
  'SPED': '[és pê éde]',
  'eSocial': '[e sôcial]',
  'REINT': '[reínte]',
  'DCTF': '[dê cê tê éfe]',
  'ECF': '[é cê éfe]',
  'CNH': '[cê erne águe]',
  'DPVAT': '[dê pê vê á tê]',
  'IPVA': '[i pê vê á]',
  'ITBI': '[i tê bê i]',
  'IPTU': '[i pê tê u]',

  // === JURÍDICO / LEGAL ===
  // REMOVIDO: Habeas corpus (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: habeas corpus (instrucao [fonema] causava erro no TTS)
  'STF': '[és tê éfe]',
  'STJ': '[és tê jota]',
  'TJ': '[tê jota]',
  'TRF': '[tê erre éfe]',
  'TSE': '[tê és e]',
  'TRE': '[tê erre e]',
  'MP': '[ême pê]',
  'MPT': '[ême pê tê]',
  'MPU': '[ême pê u]',
  'CPP': '[cê pê pê]',
  'CLT': '[cê éle tê]',
  'CPC': '[cê pê cê]',
  'CTN': '[cê tê êne]',
  'CF': '[cê éfe]',
  'CP': '[cê pê]',
  'OAB': '[ô a bê]',
  'ADIn': '[a dê in]',
  'ADI': '[a dê i]',
  'MS': '[ême és]',
  'HC': '[agá cê]',
  'REsp': '[erre és pê]',
  'AREsp': '[á erre és pê]',
  'AgRg': '[a gê erre gê]',
  'EDcl': '[é dê cê éle]',
  'EI': 'e i',
  'IRDR': '[i erre dê erre]',
  'RTJ': '[erre tê jota]',
  'RTF': '[erre tê éfe]',
  'RJTJE': '[erre jota tê jota i]',
  // REMOVIDO: Inquérito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: inquérito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Apelação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: apelação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Embargos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: embargos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Ação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Petição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: petição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Sentença (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sentença (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Acórdão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: acórdão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Desembargador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: desembargador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Relator (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: relator (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Revisor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: revisor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Vogal (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: vogal (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Procurador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: procurador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Defensor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: defensor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Jurisprudência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: jurisprudência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Súmula (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: súmula (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Enunciado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: enunciado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Precedente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: precedente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Tutela (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tutela (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Liminar (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: liminar (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Mandado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: mandado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Autos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: autos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Distribuição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: distribuição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Recurso (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: recurso (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Contrarrazões (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: contrarrazões (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Razões (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: razões (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Exceção (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: exceção (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Impugnação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: impugnação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Contestação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: contestação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Diligência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: diligência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Audiência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: audiência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Instrução (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: instrução (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Julgamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: julgamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Trânsito em julgado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Coisa julgada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Prescrição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: prescrição (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Decadência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: decadência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Perempção (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: perempção (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Intimação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: intimação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Citação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: citação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Notificação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: notificação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Penhora (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: penhora (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Apreensão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: apreensão (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Hipoteca (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hipoteca (instrucao [fonema] causava erro no TTS)

  // === FINANCEIRO / ECONOMIA ===
  // REMOVIDO: Bacen (instrucao [fonema] causava erro no TTS)
  'BCB': '[bê cê bê]',
  'CDI': '[cê dê i]',
  'Selic': '[Sélique]',
  'SELIC': '[Sélique]',
  'IPCA': '[i pê cê a]',
  'IGP-M': '[i gê pê mês]',
  'INPC': '[i êne pê cê]',
  'TR': '[tê erre]',
  'CDB': '[cê dê bê]',
  'RDB': '[erre dê bê]',
  'LCA': '[éle cê a]',
  'LCI': '[éle cê i]',
  'CRI': '[cê erre i]',
  'CRA': '[cê erre a]',
  'LCI/LCA': '[éle cê i éle cê a]',
  // REMOVIDO: Debênture (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: debênture (instrucao [fonema] causava erro no TTS)
  'FII': '[éfe i i]',
  'FIDC': '[éfe i dê cê]',
  'ETF': '[i tê éfe]',
  'Hedge': '[rédge]',
  'hedge': '[rédge]',
  'Swap': '[suáp]',
  'swap': '[suáp]',
  // REMOVIDO: Derivativo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: derivativo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Ações (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ações (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Dividendo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dividendo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Juros compostos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Amortização (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: amortização (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Depreciação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: depreciação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Balancete (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: balancete (instrucao [fonema] causava erro no TTS)
  'DRE': '[dê erre e]',
  'EBITDA': '[ebitida]',
  'ROI': '[erre ó i]',
  'ROE': '[erre ó e]',
  'ROA': '[erre ó a]',
  'EBIT': '[e bê i tê]',
  'CAPEX': '[cápex]',
  'OPEX': '[óplex]',
  'Payback': '[peibáque]',
  'payback': '[peibáque]',
  'Cash flow': '[caxe flou]',
  'Breakeven': '[breiqueven]',
  'breakeven': '[breiqueven]',
  'Spread': '[espréde]',
  'spread': '[espréde]',
  'Compliance': '[compláience]',
  'compliance': '[compláience]',
  'Due diligence': '[du diligence]',
  'Valuation': '[valuação]',
  'valuation': '[valuação]',
  'Benchmarking': '[benchmárquingue]',
  'benchmarking': '[benchmárquingue]',
  'KPI': '[cê pê i]',
  'OKR': '[ó cê erre]',
  'SLA': '[és éle a]',
  'NPS': '[ême pê és]',
  'CAGR': '[cáge arre]',
  'LTV': '[éle tê vê]',

  // === EDUCAÇÃO ===
  'ENEM': '[é nê éme]',
  'UNB': '[unê bê]',
  'USP': '[u és pê]',
  'UFRJ': '[u éfe erre jota]',
  'UFMG': '[u éfe éme gê]',
  'UFSC': '[u éfe és cê]',
  'UFRGS': '[u éfe erre gê és]',
  'UNICAMP': '[unicampe]',
  'UNESP': '[unespe]',
  'UTFPR': '[ute efê tê pê erre]',
  'IFSP': '[i éfe és pê]',
  'Pos-graduação': '[pós-graduação]',
  // REMOVIDO: pós-graduação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Mestrado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: mestrado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Doutorado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: doutorado (instrucao [fonema] causava erro no TTS)
  'TCC': '[tê cê cê]',
  // REMOVIDO: Tese (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tese (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Dissertação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dissertação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Monografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: monografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Currículo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: currículo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Grade curricular (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Ementa (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ementa (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Frequência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: frequência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Aproveitamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: aproveitamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Reprovação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: reprovação (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Matrícula (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: matrícula (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Trancamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: trancamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Transferência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: transferência (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Coordenador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: coordenador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Decano (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: decano (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Reitor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: reitor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Vice-reitor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Chanceler (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: chanceler (instrucao [fonema] causava erro no TTS)
  'Campus': '[câmpus]',
  'campus': '[câmpus]',
  // REMOVIDO: Faculdade (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: faculdade (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Departamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: departamento (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Programa (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: programa (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Disciplina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: disciplina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Docente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: docente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Discente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: discente (instrucao [fonema] causava erro no TTS)

  // === GOVERNO / ÓRGÃOS PÚBLICOS ===
  // REMOVIDO: ANVISA (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ANATEL (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ANCINE (instrucao [fonema] causava erro no TTS)
  'ANP': '[a êne pê]',
  'ANA': '[a êne a]',
  'ANTT': '[a êne tê tê]',
  'ANS': '[a êne és]',
  // REMOVIDO: ANAC (instrucao [fonema] causava erro no TTS)
  'CVM': '[cê vê éme]',
  'INPI': '[i êne pê i]',
  // REMOVIDO: INCRA (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: IBAMA (instrucao [fonema] causava erro no TTS)
  'PF': '[pê éfe]',
  'ABIN': '[abine]',
  'CGU': '[cê gê u]',
  'TCU': '[tê cê u]',
  'TJSP': '[tê jota és pê]',
  'TJRJ': '[tê jota erre jota]',
  'TJMG': '[tê jota éme gê]',
  'TRF1': '[tê erre éfe um]',
  'TRF2': '[tê erre éfe dois]',
  'TRF3': '[tê erre éfe três]',
  'TRF4': '[tê erre éfe quatro]',
  'TRF5': '[tê erre éfe cinco]',
  'TRF6': '[tê erre éfe seis]',
  // REMOVIDO: Receita Federal (instrucao [fonema] causava erro no TTS)
  'Carf': '[carfe]',
  'CARF': '[carfe]',
  'PGFN': '[pê gê éfe éne]',
  'AGU': '[a gê u]',
  'PGU': '[pê gê u]',
  // REMOVIDO: Prefeitura (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: prefeitura (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Governador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: governador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Vice-governador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Prefeito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: prefeito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Vereador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: vereador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Secretário (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: secretário (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Ministro (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ministro (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Senador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: senador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Deputado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: deputado (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Presidente (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: presidente (instrucao [fonema] causava erro no TTS)

  // === MAIS TECNOLOGIA ===
  'ChatGPT': '[Chat Gê Pê Tê]',
  'GPT-4': '[gê pê tê quatro]',
  'GPT-3': '[gê pê tê três]',
  'OpenAI': 'Open AI',
  // REMOVIDO: Claude (instrucao [fonema] causava erro no TTS)
  'Gemini': '[Gêmeine]',
  'Copilot': '[Copailete]',
  'Midjourney': '[Midjórnei]',
  'Stable Diffusion': '[Steibol Difiújion]',
  'Hugging Face': '[Raguein Feice]',
  'Gradio': '[Grádio]',
  'PyTorch': '[Páitorche]',
  'TensorFlow': '[Ténsorflou]',
  'Flutter': '[Fláuter]',
  'Dart': '[Darte]',
  'Kotlin': '[Cótline]',
  'Swift': '[Suíte]',
  'Rust': '[Raste]',
  'Go': '[Gó]',
  'MongoDB': '[Mongó DB]',
  'Redis': '[Rédise]',
  'PostgreSQL': 'Postgres QL',
  'GraphQL': 'Graph QL',
  'REST': '[réste]',
  'REST API': '[réste API]',
  'WebSocket': '[Uébe Sócquete]',
  'Nginx': '[Njinxe]',
  // REMOVIDO: Apache (instrucao [fonema] causava erro no TTS)
  'Jenkins': '[Jênquins]',
  'GitLab': '[GitLabe]',
  // REMOVIDO: Jira (instrucao [fonema] causava erro no TTS)
  'Notion': '[Nócion]',
  'Figma': '[Fígma]',
  'Canva': '[Cánva]',
  'Miro': '[Míro]',
  'Trello': '[Trélo]',
  'Asana': '[Azana]',
  'Slack': 'Slace',
  'Basecamp': '[Beisecâmpe]',
  'Vercel': '[Versel]',
  'Supabase': '[Supabeise]',
  'Firebase': '[Faíberbeise]',
  'Heroku': '[Herócue]',
  'DigitalOcean': '[Digital Océan]',
  'AWS': '[a dabliu és]',
  'GCP': '[gê cê pê]',
  'Azure': '[ézurre]',

  // === MAIS MARCAS BRASILEIRAS ===
  // REMOVIDO: Magalu (instrucao [fonema] causava erro no TTS)
  'Shopee': '[Xópi]',
  'OLX': '[ó éle ixe]',
  'Rappi': '[Rapi]',
  '99': '[noventa e nove]',
  'Stone': '[Istóne]',
  'PagSeguro': '[Pague Seguro]',
  'Cielo': '[Siélo]',
  // REMOVIDO: Rede (instrucao [fonema] causava erro no TTS)
  'Getnet': '[Guetnete]',
  'Elavon': '[Elavóne]',
  'Adyen': '[Aidéne]',
  'Stripe': '[Estraípe]',
  'Wise': '[Uáize]',
  // REMOVIDO: Remessa Online (instrucao [fonema] causava erro no TTS)
  'Nomad': '[Nômade]',
  // REMOVIDO: Inter (instrucao [fonema] causava erro no TTS)
  'C6 Bank': '[Cê Seis Bank]',
  'BTG Pactual': '[Bê Tê Gê Pactual]',
  // REMOVIDO: XP Investimentos (instrucao [fonema] causava erro no TTS)
  'Clear': '[Clír]',
  // REMOVIDO: Guide Investimentos (instrucao [fonema] causava erro no TTS)
  'Modal': '[Módau]',
  'Easynvest': '[Easinvést]',
  // REMOVIDO: Rico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Toro (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Nu Pagamentos (instrucao [fonema] causava erro no TTS)
  'Conductor': '[Condutor]',
  'Wirecard': '[Uáiarcárde]',
  'Moip': '[Móipe]',
  'PayPal': '[Pei Pei El]',
  // REMOVIDO: Mercado Bitcoin (instrucao [fonema] causava erro no TTS)
  'Bitcoin': '[Bicoine]',
  'Ethereum': '[Ethereúme]',
  'Litecoin': '[Láitecoine]',
  'USDT': '[u és dê tê]',
  'Stablecoin': '[Steibolcoine]',
  'Blockchain': '[Blocqueine]',
  'Web3': '[Uébe três]',
  // REMOVIDO: Metaverso (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: metaverso (instrucao [fonema] causava erro no TTS)
  'NFT': '[éne éfe tê]',

  // === MAIS SAÚDE / MEDICAMENTOS ===
  // REMOVIDO: amoxicilina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: azitromicina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: loratadina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dipirona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: paracetamol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ibuprofeno (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: diclofenaco (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: nimesulida (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: omeprazol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: pantoprazol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ranitidina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: losartana (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: atenolol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: captopril (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: enalapril (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sinvastatina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: atorvastatina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: rosuvastatina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: metformina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: glibenclamida (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: insulina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: prednisona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dexametasona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hidroxicloroquina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cloroquina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ivermectina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: warfarina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: heparina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: enoxaparina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: diazepam (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: clonazepam (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: alprazolam (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sertralina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fluoxetina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: escitalopram (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: bupropiona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: venlafaxina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: carbamazepina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: valproato (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: topiramato (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: lamotrigina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: levetiracetam (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fenitoína (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: carvedilol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anlodipino (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: furosemida (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: espironolactona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sacubitril (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: digoxina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: amiodarona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sotalol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: propafenona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: flecainida (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: metoprolol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: propranolol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: mesalazina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: olsalazina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sulfasalazina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: azatioprina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: metotrexato (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: aciclovir (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: valaciclovir (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: oseltamivir (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ritonavir (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: lopinavir (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ceftriaxona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cefazolina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: vancomicina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: meropenem (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: piperacilina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: gentamicina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anfotericina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fluconazol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: itraconazol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ambroxol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: salbutamol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: prednisolona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: budesonida (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fluticasona (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: montelucaste (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: desloratadina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cetirizina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fexofenadina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ebastina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ketotifeno (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: betametasona (instrucao [fonema] causava erro no TTS)
  'vitamina D': '[vitamina dê]',
  'vitamina B12': '[vitamina bê doze]',
  'vitamina C': '[vitamina cê]',
  // REMOVIDO: óleo de cozinha (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antibiótico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anti-inflamatório (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antialérgico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: analgésico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antipirético (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anticonvulsivante (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antidepressivo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ansiolítico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hipnótico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antipsicótico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: estabilizador de humor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: broncodilatador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: corticosteroide (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: imunossupressor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anti-hipertensivo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anticoagulante (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antiagregante (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: estatina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: betabloqueador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: inibidor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: bloqueador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: diurético (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: vasodilatador (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antiarrítmico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cardioversor (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antihistamínico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: probiótico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: laxante (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antisséptico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anestésico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anticoncepcional (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hormônio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cortisol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tiroxina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: levo-tiroxina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: alendronato (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: calcitriol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: colecalciferol (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: carbonato de cálcio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sulfato ferroso (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ácido fólico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dabigatrana (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: rivaroxabana (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: apixabana (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: edoxabana (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: dalteparina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: nadroparina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: bemiparina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fibrinolítico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: trombolítico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: radiografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: eletrocardiograma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ressonância magnética (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: tomografia computadorizada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ultrassom (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ecocardiograma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: holter (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ergométrico (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cateterismo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: endoscopia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: colonoscopia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: biópsia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: polissonografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: espirometria (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: eletroencefalograma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: eletromiografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: mamografia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: densitometria (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hemograma (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: glicemia (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hemoglobina glicada (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: creatinina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ureia (instrucao [fonema] causava erro no TTS)
  'TSH': '[tê és agá]',
  'T4 livre': '[tê quatro livre]',
  'PSA': '[pê és a]',
  'PCR': '[pê cê erre]',
  'RAFA': '[arre a éfe a]',
  'VHS': '[vê agá és]',
  'PCR COVID': '[pê cê erre côvide]',
  // REMOVIDO: antígeno (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: anticorpo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sorologia (instrucao [fonema] causava erro no TTS)
  'IgG': '[i gê gê]',
  'IgM': '[i gê éme]',
  'IgA': '[i gê a]',
  // REMOVIDO: linfócito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: leucócito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hemácias (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: plaquetas (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: trombócitos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: neutrófilos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: basófilos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: eosinófilos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: monócitos (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: glicose (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hemoglobina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: hematócrito (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: potássio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: sódio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: magnésio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cálcio (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: fósforo (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ferro (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: ferritina (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: transferrina (instrucao [fonema] causava erro no TTS)
  'TPA': '[tê pê a]',
  'INR': '[i êne erre]',
  // REMOVIDO: protrombina (instrucao [fonema] causava erro no TTS)
  'aPTT': '[a pê tê tê]',
  // REMOVIDO: fibrinogênio (instrucao [fonema] causava erro no TTS)
  'D-dímero': '[dê dímero]',
  // REMOVIDO: troponina (instrucao [fonema] causava erro no TTS)
  'CK-MB': '[cê cáême bê]',
  'BNP': '[bê êne pê]',
  'proBNP': '[pró bê êne pê]',
  // REMOVIDO: peptídeo natriurético (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: lactato (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: gasometria (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: cultura (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: antibiograma (instrucao [fonema] causava erro no TTS)
  'swab': '[suabe]',
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
  'xarope': '[charope]',
  'Xarope': '[Charope]',
  'xaxim': '[chachim]',
  'Xaxim': '[Chachim]',
  'xadrez': '[chadrez]',
  'Xadrez': '[Chadrez]',
  'xampu': '[champu]',
  'Xampu': '[Champu]',
  'xavante': '[chavante]',
  'Xavante': '[Chavante]',
  'enxada': '[enchada]',
  'enxame': '[enchame]',
  'enxoval': '[enchoval]',
  'enxaqueca': '[enchaqueca]',
  'enxuto': '[enchuto]',
  'peixada': '[peichada]',
  'Peixada': '[Peichada]',
  'peixe': '[peiche]',
  'Peixe': '[Peiche]',
  'baixar': '[baichar]',
  'Baixar': '[Baichar]',
  'baixo': '[baicho]',
  'Baixo': '[Baicho]',
  'baixa': '[baicha]',
  'Baixa': '[Baicha]',
  'caxinguelê': '[cachinguelê]',
  'relaxar': '[relachar]',
  'Relaxar': '[Relachar]',
  'relaxamento': '[relachamento]',
  'Relaxamento': '[Relachamento]',
  'axila': '[achila]',
  'Axila': '[Achila]',

  // X = Z (som de "z" — ex- antes de vogal)
  'exército': '[ezército]',
  'Exército': '[Ezército]',
  'exemplo': '[ezemplo]',
  'Exemplo': '[Ezemplo]',
  'exercício': '[ezercício]',
  'Exercício': '[Ezercício]',
  'exigir': '[ezigir]',
  'Exigir': '[Ezigir]',
  'exílio': '[ezílio]',
  'Exílio': '[Ezílio]',
  'existir': '[ezistir]',
  'Existir': '[Ezistir]',
  'exame': '[ezame]',
  'Exame': '[Ezame]',
  'exato': '[ezato]',
  'Exato': '[Ezato]',
  'exceção': 'ezeção',
  'Exceção': 'Ezeção',
  'excluir': '[ezcluir]',
  'Excluir': '[Ezcluir]',
  'executar': '[ezecutar]',
  'Executar': '[Ezecutar]',
  'exibir': '[ezibir]',
  'Exibir': '[Ezibir]',
  'exótico': '[ezótico]',
  'Exótico': '[Ezótico]',
  'expor': '[ezpor]',
  'Expor': '[Ezpor]',
  'extensão': '[estensão]',
  'Extensão': '[Estensão]',
  'explicar': '[esplicar]',
  'Explicar': '[Esplicar]',
  // REMOVIDO: exportar (instrucao [fonema] causava erro no TTS)
  // REMOVIDO: Exportar (instrucao [fonema] causava erro no TTS)
  'expressão': '[espressão]',
  'Expressão': '[Espressão]',
  'extraordinário': '[estraordinário]',
  'Extraordinário': '[Estraordinário]',
  'extrato': '[estrato]',
  'Extrato': '[Estrato]',
  'experiência': '[esperiência]',
  'Experiência': '[Esperiência]',
  'expresso': '[espresso]',
  'Expresso': '[Espresso]',
  'explosão': '[esplosão]',
  'Explosão': '[Esplosão]',
  'explorar': '[esplorar]',
  'Explorar': '[Esplorar]',
  'exposição': '[esposição]',
  'Exposição': '[Esposição]',
  'explícito': '[esplicito]',
  'Explícito': '[Esplicito]',
  'expectativa': '[espectativa]',
  'Expectativa': '[Espectativa]',
  'exíguo': '[ezíguo]',
  'Exíguo': '[Ezíguo]',

  // X = SS (som de "ss")
  'México': '[Méssico]',
  'mexicano': '[messicano]',
  'Mexicano': '[Messicano]',
  'mexicana': '[messicana]',
  'Mexicana': '[Messicana]',
  'vexame': '[vessame]',
  'Vexame': '[Vessame]',
  'mexer': '[messer]',
  'Mexer': '[Messer]',
  'mexida': '[messida]',
  'Mexida': '[Messida]',

  // X = KS (som de "ks")
  'táxi': '[tácsi]',
  'Táxi': '[Tácsi]',
  'sexo': '[sessso]',
  'Sexo': '[Sessso]',
  'complexo': '[complekso]',
  'Complexo': '[Complekso]',
  'perplexo': '[perplekso]',
  'Perplexo': '[Perplekso]',
  'têxtil': '[têkstil]',
  'Têxtil': '[Têkstil]',
  'sintaxe': '[sintakse]',
  'Sintaxe': '[Sintakse]',
  'ortodoxo': '[ortodokso]',
  'Ortodoxo': '[Ortodokso]',
  'paradoxo': '[paradokso]',
  'Paradoxo': '[Paradokso]',
  'nexus': '[neksus]',
  'fixo': '[fikso]',
  'Fixo': '[Fikso]',
  'fixar': '[fiksar]',
  'Fixar': '[Fiksar]',
  'maximizar': '[maksimizar]',
  'Maximizar': '[Maksimizar]',
  'máximo': '[máksimo]',
  'Máximo': '[Máksimo]',
  // REMOVIDO: mínimo (instrucao [fonema] causava erro no TTS)
  'taxa': '[taksa]',
  'Taxa': '[Taksa]',
  'oxigênio': '[oksijênio]',
  'Oxigênio': '[Oksijênio]',
  'tóxico': '[tóksico]',
  'Tóxico': '[Tóksico]',
  'toxina': '[toksina]',
  'Toxina': '[Toksina]',
  'intoxicação': '[intoksicação]',
  'Intoxicação': '[Intoksicação]',

  // Xangai — nome próprio, som de CH
  // REMOVIDO: Xangai (instrucao [fonema] causava erro no TTS)
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
  //   - X em palavras específicas = SS (México, maxXico, vexame)
  // Implementado como função auxiliar abaixo
  result = preprocessX(result)

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
