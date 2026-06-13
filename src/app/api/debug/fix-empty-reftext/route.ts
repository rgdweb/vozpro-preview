/**
 * POST /api/debug/fix-empty-reftext
 *
 * Transcreve TODAS as variações com refText vazio via ASR (Whisper)
 * e salva diretamente no banco de dados Prisma.
 *
 * Parâmetros query:
 *   ?limit=N       — processa no máximo N variações (default: todas)
 *   ?dry=true      — simula sem salvar no banco
 *   ?delay=1000    — delay entre transcrições em ms (default: 500)
 *
 * Segurança: admin-only (mesma auth dos demais endpoints de debug)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminSession } from '@/lib/auth'
// getAdminSession() retorna boolean (true = admin autenticado)
import { transcribeFromUrl } from '@/lib/asr-transcriber'

const DEFAULT_DELAY_MS = 500
const MAX_RETRIES = 1

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // ---- AUTH ----
  const isAdmin = await getAdminSession()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '0', 10) || 0
  const dryRun = searchParams.get('dry') === 'true'
  const delayMs = parseInt(searchParams.get('delay') || String(DEFAULT_DELAY_MS), 10)

  // ---- BUSCAR VARIAÇÕES COM refText VAZIO ----
  const whereClause: any = {
    active: true,
    OR: [
      { refText: '' },
    ],
  }

  const variations = await db.voiceVariation.findMany({
    where: whereClause,
    include: { voice: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
    ...(limit > 0 ? { take: limit } : {}),
  })

  if (variations.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Todas as variações já possuem refText preenchido.',
      processed: 0,
    })
  }

  const toProcess = limit > 0 ? variations.slice(0, limit) : variations
  const results = {
    total: toProcess.length,
    transcribed: 0,
    failed: 0,
    skipped: 0,
    saved: 0,
    details: [] as Array<{
      voiceId: string
      voiceName: string
      variationId: string
      label: string
      url: string
      transcription: string
      error?: string
      saved: boolean
    }>,
  }

  console.log(`[fix-empty-reftext] Iniciando: ${toProcess.length} variações (dryRun=${dryRun}, delay=${delayMs}ms)`)

  for (let i = 0; i < toProcess.length; i++) {
    const v = toProcess[i]
    const voiceName = v.voice?.name || 'Desconhecida'
    const audioUrl = v.refAudioServerUrl

    // Pular se não tem URL de áudio
    if (!audioUrl || !audioUrl.trim()) {
      results.skipped++
      results.details.push({
        voiceId: v.voiceId,
        voiceName,
        variationId: v.id,
        label: v.label,
        url: '',
        transcription: '',
        error: 'Sem URL de áudio',
        saved: false,
      })
      continue
    }

    // Tentar transcrever (com retry)
    let transcription = ''
    let error = ''

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await transcribeFromUrl(audioUrl)
      if (result.success && result.text) {
        transcription = result.text
        break
      }
      error = result.error || 'Transcrição falhou'
      if (attempt < MAX_RETRIES) {
        console.log(`[fix-empty-reftext] Retry ${attempt + 1}/${MAX_RETRIES}: ${voiceName} - ${v.label}`)
        await sleep(2000) // espera extra antes do retry
      }
    }

    const success = !!transcription
    let saved = false

    if (success) {
      results.transcribed++
      console.log(`[${i + 1}/${toProcess.length}] OK ${voiceName} - ${v.label}: "${transcription.substring(0, 60)}..."`)

      // Salvar no banco
      if (!dryRun) {
        try {
          await db.voiceVariation.update({
            where: { id: v.id },
            data: { refText: transcription },
          })
          saved = true
          results.saved++
        } catch (dbErr) {
          error = `DB error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`
          console.error(`[fix-empty-reftext] DB save failed: ${voiceName} - ${v.label}: ${error}`)
        }
      } else {
        saved = true // simulated
        results.saved++
      }
    } else {
      results.failed++
      console.error(`[${i + 1}/${toProcess.length}] FALHA ${voiceName} - ${v.label}: ${error}`)
    }

    results.details.push({
      voiceId: v.voiceId,
      voiceName,
      variationId: v.id,
      label: v.label,
      url: audioUrl.substring(0, 80),
      transcription: transcription.substring(0, 200),
      error: success ? undefined : error,
      saved,
    })

    // Rate limiting — não sobrecarregar a API de ASR
    if (i < toProcess.length - 1) {
      await sleep(delayMs)
    }
  }

  console.log(`[fix-empty-reftext] Finalizado: ${results.transcribed} transcritas, ${results.failed} falharam, ${results.saved} salvas, ${results.skipped} puladas`)

  return NextResponse.json({
    success: true,
    dryRun,
    message: dryRun
      ? `Simulação completa. ${results.transcribed} transcrições teriam sido salvas.`
      : `Concluído! ${results.saved} refTexts salvos no banco.`,
    ...results,
  })
}