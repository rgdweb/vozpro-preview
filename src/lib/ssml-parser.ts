/**
 * SSML Parser — Converte tags SSML para formato nativo VozPro Turbo ou texto plano F5-TTS
 * 
 * Suporta tags SSML:
 * - <break time="500ms"/> → pausa
 * - <emphasis level="strong">texto</emphasis> → ênfase
 * - <prosody rate="slow">texto</prosody> → velocidade
 * - <prosody pitch="high">texto</prosody> → tom
 * - <prosody volume="loud">texto</prosody> → volume
 * - <say-as interpret-as="...">texto</say-as> → interpretação
 * - <phoneme alphabet="ipa" ph="...">texto</phoneme> → pronúncia fonética
 * - <s>texto</s> → sentença
 * - <p>texto</p> → parágrafo
 * - <sub alias="substituto">original</sub> → substituição
 * 
 * Para VozPro Turbo: Converte para notação [bracket] nativa + símbolos de emoção
 * Para F5-TTS: Converte para texto plano com pontuação de pausa
 */

export type TTSEngine = 'vozpro' | 'f5tts'

interface SSMLConfig {
  engine: TTSEngine
}

/**
 * Detecta se o texto contém tags SSML
 */
export function containsSSML(text: string): boolean {
  return /<speak\b|<break\b|<emphasis\b|<prosody\b|<say-as\b|<phoneme\b|<sub\b/i.test(text)
}

/**
 * Remove a tag <speak> wrapper se presente
 */
function removeSpeakWrapper(text: string): string {
  return text.replace(/<\/?speak[^>]*>/gi, '').trim()
}

/**
 * Parseia SSML para texto processado pelo TTS engine especificado
 * 
 * @param text Texto com tags SSML
 * @param engine Tipo de engine: 'vozpro' ou 'f5tts'
 * @returns Texto processado para o engine
 */
export function parseSSML(text: string, engine: TTSEngine = 'vozpro'): string {
  if (!containsSSML(text)) return text

  let result = removeSpeakWrapper(text)

  // Processar na ordem correta: inner tags first
  result = processSubTags(result)
  result = processPhonemeTags(result, engine)
  result = processSayAsTags(result)
  result = processProsodyTags(result, engine)
  result = processEmphasisTags(result, engine)
  result = processBreakTags(result, engine)
  result = processParagraphTags(result, engine)
  result = processSentenceTags(result, engine)

  return result
}

/**
 * <sub alias="substituto">original</sub> → substituído pelo alias
 */
function processSubTags(text: string): string {
  return text.replace(/<sub\s+alias="([^"]+)">([^<]*)<\/sub>/gi, (_match, alias, _original) => {
    return alias
  })
}

/**
 * <phoneme alphabet="ipa" ph="...">texto</phoneme>
 * VozPro: Usa [pronúncia fonética]
 * F5-TTS: Usa [pronúncia fonética] (também suporta brackets)
 */
function processPhonemeTags(text: string, _engine: TTSEngine): string {
  return text.replace(/<phoneme\s+[^>]*ph="([^"]+)"[^>]*>([^<]*)<\/phoneme>/gi, (_match, phoneme, _original) => {
    // Converter IPA/CMU para notação de bracket
    return `[${phoneme}]`
  })
}

/**
 * <say-as interpret-as="characters">ABC</say-as> → soletrar
 * <say-as interpret-as="date">2024-03-15</say-as> → data por extenso
 * <say-as interpret-as="number">1234</say-as> → número por extenso
 * <say-as interpret-as="telephone">(11) 99999-9999</say-as> → telefone
 * <say-as interpret-as="cardinal">100</say-as> → cardinal
 * <say-as interpret-as="ordinal">1</say-as> → ordinal
 * <say-as interpret-as="currency">$100</say-as> → moeda
 */
function processSayAsTags(text: string): string {
  // characters → soletrar cada letra
  text = text.replace(/<say-as\s+[^>]*interpret-as="characters"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    return content.split('').join(' ')
  })

  // date → data por extenso (formato YYYY-MM-DD)
  text = text.replace(/<say-as\s+[^>]*interpret-as="date"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    const dateMatch = content.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch) {
      const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
      const day = parseInt(dateMatch[3])
      const month = months[parseInt(dateMatch[2]) - 1] || dateMatch[2]
      const year = dateMatch[1]
      return `${day} de ${month} de ${year}`
    }
    return content
  })

  // telephone → já será processado pelo pronunciation optimizer
  text = text.replace(/<say-as\s+[^>]*interpret-as="telephone"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    return content // Deixar o otimizador de pronúncia lidar com isso
  })

  // number → envolver para o otimizador lidar
  text = text.replace(/<say-as\s+[^>]*interpret-as="(?:number|cardinal)"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    return content
  })

  // ordinal → envolver para o otimizador lidar
  text = text.replace(/<say-as\s+[^>]*interpret-as="ordinal"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    return `${content}º`
  })

  // currency → marcar para o otimizador lidar
  text = text.replace(/<say-as\s+[^>]*interpret-as="currency"[^>]*>([^<]*)<\/say-as>/gi, (_match, content) => {
    return content
  })

  return text
}

/**
 * <prosody rate="slow|fast|0.8|120%">texto</prosody>
 * <prosody pitch="high|low|medium">texto</prosody>
 * <prosody volume="loud|soft|medium">texto</prosody>
 */
function processProsodyTags(text: string, engine: TTSEngine): string {
  // rate="slow" ou rate="0.8" etc
  text = text.replace(/<prosody\s+[^>]*rate="([^"]+)"[^>]*>([\s\S]*?)<\/prosody>/gi, (_match, rate, content) => {
    if (engine === 'vozpro') {
      // VozPro suporta rate via instruct ou speed param
      if (rate === 'slow' || rate === 'x-slow' || parseFloat(rate) < 0.9) {
        return `{{slow}}${content}{{/slow}}`
      }
      if (rate === 'fast' || rate === 'x-fast' || parseFloat(rate) > 1.1) {
        return `{{fast}}${content}{{/fast}}`
      }
      return content
    } else {
      // F5-TTS: usa pontuação
      if (rate === 'slow' || rate === 'x-slow' || parseFloat(rate) < 0.9) {
        return content.replace(/(\s+)/g, ', $1') // vírgulas entre palavras
      }
      return content
    }
  })

  // pitch="high|low"
  text = text.replace(/<prosody\s+[^>]*pitch="([^"]+)"[^>]*>([\s\S]*?)<\/prosody>/gi, (_match, pitch, content) => {
    if (engine === 'vozpro') {
      // VozPro suporta emotion symbols
      if (pitch === 'high') return `[↑${content}]`
      if (pitch === 'low') return `[↓${content}]`
      return content
    }
    return content
  })

  // volume="loud|soft"
  text = text.replace(/<prosody\s+[^>]*volume="([^"]+)"[^>]*>([\s\S]*?)<\/prosody>/gi, (_match, volume, content) => {
    if (engine === 'vozpro') {
      if (volume === 'loud' || volume === 'x-loud') return `{{emphasis}}${content}{{/emphasis}}`
      if (volume === 'soft' || volume === 'x-soft') return `{{whisper}}${content}{{/whisper}}`
      return content
    }
    return content
  })

  // prosody sem atributos específicos (combinados)
  text = text.replace(/<prosody[^>]*>([\s\S]*?)<\/prosody>/gi, (_match, content) => {
    return content
  })

  return text
}

/**
 * <emphasis level="strong|moderate|reduced">texto</emphasis>
 */
function processEmphasisTags(text: string, engine: TTSEngine): string {
  return text.replace(/<emphasis\s+level="([^"]+)">([\s\S]*?)<\/emphasis>/gi, (_match, level, content) => {
    if (engine === 'vozpro') {
      if (level === 'strong') return `{{emphasis}}${content}{{/emphasis}}`
      if (level === 'reduced') return `{{whisper}}${content}{{/whisper}}`
      return `[${content}]` // moderate → brackets para pronúncia mais clara
    } else {
      // F5-TTS: ALL CAPS para ênfase forte
      if (level === 'strong') return content.toUpperCase()
      return content
    }
  })
}

/**
 * <break time="500ms"/> ou <break strength="strong"/>
 */
function processBreakTags(text: string, engine: TTSEngine): string {
  // time="Xms" ou time="Xs"
  text = text.replace(/<break\s+[^>]*time="(\d+)(ms|s)"[^>]*\/?>/gi, (_match, value, unit) => {
    let ms = parseInt(value)
    if (unit === 's') ms = ms * 1000

    if (engine === 'vozpro') {
      return `{{pause:${ms}}}`
    } else {
      // F5-TTS: usa pontuação e newlines
      if (ms >= 800) return '.\n'
      if (ms >= 500) return '...\n'
      if (ms >= 300) return ',\n'
      return ',  '
    }
  })

  // strength="x-strong|strong|medium|weak"
  text = text.replace(/<break\s+[^>]*strength="([^"]+)"[^>]*\/?>/gi, (_match, strength) => {
    if (engine === 'vozpro') {
      switch (strength) {
        case 'x-strong': return '{{pause:1000}}'
        case 'strong': return '{{pause:700}}'
        case 'medium': return '{{pause:400}}'
        case 'weak': return '{{pause:200}}'
        default: return '{{pause:300}}'
      }
    } else {
      switch (strength) {
        case 'x-strong': return '.\n'
        case 'strong': return '...\n'
        case 'medium': return ',\n'
        case 'weak': return ', '
        default: return ',  '
      }
    }
  })

  // <break/> sem atributos
  text = text.replace(/<break\s*\/?>/gi, engine === 'vozpro' ? '{{pause:300}}' : ',  ')

  return text
}

/**
 * <p>texto</p> → parágrafo
 */
function processParagraphTags(text: string, engine: TTSEngine): string {
  text = text.replace(/<\/p>/gi, engine === 'vozpro' ? '\n\n{{pause:800}}\n' : '.\n\n')
  text = text.replace(/<p[^>]*>/gi, '')
  return text
}

/**
 * <s>texto</s> → sentença
 */
function processSentenceTags(text: string, engine: TTSEngine): string {
  text = text.replace(/<\/s>/gi, engine === 'vozpro' ? '. ' : '.\n')
  text = text.replace(/<s[^>]*>/gi, '')
  return text
}
