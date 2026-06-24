/**
 * 🛡️ BLINDAGEM — Transcribe Audio Endpoint
 * ⚠️ Este endpoint transcreve áudio de referência para gerar refText.
 * Sem refText, o F5-TTS não consegue clonar a voz e gera áudio "falando em línguas".
 * Erro já cometido: refText nunca era preenchido automaticamente. Ver BLINDAGEM.md.
 *
 * POST /api/admin/transcribe-audio
 * Body: { audioUrl?: string, audioBase64?: string }
 * Retorna: { text: string, confidence: number, success: boolean, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { transcribeFromUrl, transcribeFromBase64 } from '@/lib/asr-transcriber'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { audioUrl, audioBase64 } = body

    if (!audioUrl && !audioBase64) {
      return NextResponse.json(
        { error: 'Informe audioUrl ou audioBase64', success: false, text: '', confidence: 0 },
        { status: 400 }
      )
    }

    let result

    if (audioUrl) {
      result = await transcribeFromUrl(audioUrl)
    } else {
      result = await transcribeFromBase64(audioBase64)
    }

    if (!result.success) {
      return NextResponse.json({
        text: '',
        confidence: 0,
        success: false,
        error: result.error || 'Transcrição falhou',
      }, { status: 200 }) // 200 mesmo em falha — o frontend decide se mostra erro
    }

    return NextResponse.json({
      text: result.text,
      confidence: result.confidence,
      success: true,
    })
  } catch (error) {
    console.error('[TranscribeAudio] Erro:', error)
    const msg = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json(
      { text: '', confidence: 0, success: false, error: msg },
      { status: 500 }
    )
  }
}
