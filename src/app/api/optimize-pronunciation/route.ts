/**
 * Pronunciation Optimization Agent (API Route)
 *
 * Usa LLM (z-ai-web-dev-sdk) para analisar texto em PT-BR e corrigir
 * pronúncias problemáticas antes de enviar ao TTS (OmniVoice / F5-TTS).
 *
 * O agente detecta e corrige automaticamente:
 * 1. Artigos no início de frase após ponto (". O sistema" → ". [o] sistema")
 * 2. Números e valores monetários (R$ 1.599,90 → [mil quinhentos...])
 * 3. URLs e e-mails (www.site.com → [w w w ponto site ponto com])
 * 4. Abreviações e siglas (Sr., Av., etc.)
 * 5. Termos em inglês com pronúncia em PT-BR
 *
 * A correção usa colchetes [pronúncia] que o OmniVoice respeita fielmente.
 */

import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Singleton SDK instance (same pattern as asr-validator.ts)
let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

const SYSTEM_PROMPT = `Você é um agente especialista em otimização de pronúncia para TTS (text-to-speech) em português brasileiro.

Seu trabalho: analisar o texto e corrigir APENAS as palavras que o TTS pode pronunciar errado, usando colchetes [pronúncia correta].

## REGRAS OBRIGATÓRIAS:

1. **Artigos no início de frase após ponto final**: O TTS confunde "O" e "A" artigos com a letra. SEMPRE coloque em minúsculo entre colchetes.
   - ". O sistema" → ". [o] sistema"
   - ". A casa" → ". [a] casa"  
   - ". Os resultados" → ". [os] resultados"
   - ". As coisas" → ". [as] coisas"
   - ". Um homem" → ". [um] homem"
   - ". Uma mulher" → ". [uma] mulher"
   - ". Uns carros" → ". [uns] carros"
   - ". Umas ideas" → ". [umas] ideias"

2. **Números soltos ou em contextos específicos**: Escreva por extenso entre colchetes.
   - "dia 15" → "dia [quinze]"
   - "às 14h" → "às [quatorze] horas"
   - "capítulo 3" → "capítulo [três]"
   - "ano 2024" → "ano [dois mil vinte e quatro]"
   - NÃO corrija números que já estão escritos por extenso

3. **Valores monetários**: Escreva por extenso entre colchetes.
   - "R$ 50" → "[cinquenta reais]"
   - "R$ 1.599,90" → "[mil quinhentos e noventa e nove reais e noventa centavos]"
   - "$ 100" → "[cem dólares]"

4. **URLs e e-mails**: Escreva letra por letra entre colchetes.
   - "www.site.com.br" → "[w w w ponto site ponto com ponto br]"
   - "contato@email.com" → "[contato arroba email ponto com]"

5. **Abreviações**: Expanda entre colchetes.
   - "Sr." → "[Senhor]"
   - "Sra." → "[Senhora]"
   - "Dr." → "[Doutor]"
   - "Dra." → "[Doutora]"
   - "Av." → "[Avenida]"
   - "Prof." → "[Professor]"
   - "Gov." → "[Governador]"

6. **Horários e datas**:
   - "14h" → "[quatorze] horas"
   - "08:30" → "[oito horas e trinta]"
   - "15/03/2024" → "[quinze de março de dois mil vinte e quatro]"

7. **Porcentagens**:
   - "50%" → "[cinquenta por cento]"
   - "10% de desconto" → "[dez por cento] de desconto"

## REGRAS DE NÃO INTERFERÊNCIA:

- NÃO altere palavras que o TTS já pronuncia bem
- NÃO adicione vírgulas ou pontuação que não existia
- NÃO altere a estrutura das frases
- NÃO traduza palavras — apenas corrija pronúncia
- NÃO coloque colchetes em palavras normais do texto
- NÃO resuma ou encurte o texto de NENHUMA forma
- Mantenha TODOS os pontos finais, vírgulas, exclamações e interrogações EXATAMENTE onde estão

## FORMATO DE SAÍDA:

Responda APENAS com o texto corrigido. Nenhuma explicação, nenhum comentário, nenhum prefixo.
Se não houver nada para corrigir, retorne o texto exatamente como veio.
O texto deve ser idêntico ao original, com EXCEÇÃO das correções entre colchetes.`

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Texto vazio' }, { status: 400 })
    }

    const originalText = text.trim()

    // Skip very short texts (less than 5 chars) - nothing to optimize
    if (originalText.length < 5) {
      return NextResponse.json({
        optimized: originalText,
        changed: false,
        changes: 0,
      })
    }

    // Quick regex pre-check: if nothing potentially problematic exists, skip LLM call
    const hasArticlesAfterPeriod = /\.\s+[OoAaUu]\s+[a-záàãâéèêíïóôõúüç]/.test(originalText)
    const hasNumbers = /\d/.test(originalText)
    const hasUrls = /www\.|https?:\/\/|\.com|\.br/.test(originalText)
    const hasEmails = /\S+@\S+\.\S+/.test(originalText)
    const hasAbbreviations = /\b(Sr|Sra|Dr|Dra|Prof|Gov|Av|Rua)\.\s/i.test(originalText)
    const hasPercentages = /\d+%/.test(originalText)
    const hasCurrency = /R\$\s*\d|\$\s*\d/.test(originalText)

    const needsOptimization = hasArticlesAfterPeriod || hasNumbers || hasUrls || hasEmails
      || hasAbbreviations || hasPercentages || hasCurrency

    if (!needsOptimization) {
      return NextResponse.json({
        optimized: originalText,
        changed: false,
        changes: 0,
      })
    }

    console.log('[Pronunciation Agent] Analisando texto (' + originalText.length + ' chars)...')

    const zai = await getZAI()

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: originalText },
      ],
      temperature: 0.1, // Low temperature for consistent corrections
    })

    const optimized = completion.choices[0]?.message?.content?.trim()

    if (!optimized) {
      console.log('[Pronunciation Agent] LLM retornou vazio, usando original')
      return NextResponse.json({
        optimized: originalText,
        changed: false,
        changes: 0,
      })
    }

    // Count changes: count brackets pairs in the optimized text
    const bracketMatches = optimized.match(/\[[^\]]+\]/g)
    const changes = bracketMatches ? bracketMatches.length : 0
    const changed = changes > 0

    console.log('[Pronunciation Agent] Resultado:', changed ? `${changes} correções` : 'sem alterações')

    return NextResponse.json({
      optimized,
      changed,
      changes,
    })
  } catch (error) {
    console.error('[Pronunciation Agent] Erro:', error instanceof Error ? error.message : String(error))
    // On error, return original text - never block generation
    const body = await request.json().catch(() => ({ text: '' }))
    return NextResponse.json({
      optimized: body.text?.trim() || '',
      changed: false,
      changes: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
}
