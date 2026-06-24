/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/admin/speakers/convert — Ativa/Desativa VARIACAO como Locutor Oficial (clone_fast)
export async function POST(req: NextRequest) {
  const startTime = Date.now()
  console.log('[SpeakerConvert] POST recebido')

  try {
    const body = await req.json()
    const { variationId, enable } = body
    console.log('[SpeakerConvert] Body:', JSON.stringify({ variationId, enable }))

    if (!variationId) {
      console.error('[SpeakerConvert] ERRO: variationId nao enviado')
      return NextResponse.json({ error: 'variationId obrigatório' }, { status: 400 })
    }

    // Buscar a VARIAÇÃO diretamente (é ela que tem o áudio)
    console.log('[SpeakerConvert] Buscando variacao:', variationId)
    const variation = await db.voiceVariation.findUnique({
      where: { id: variationId },
      include: { voice: true },
    })

    if (!variation) {
      console.error('[SpeakerConvert] ERRO: Variacao nao encontrada:', variationId)
      return NextResponse.json({ error: 'Variação não encontrada' }, { status: 404 })
    }

    console.log('[SpeakerConvert] Variacao encontrada:', variation.label, '| voz:', variation.voice.name)

    if (!variation.refAudioServerUrl) {
      console.error('[SpeakerConvert] ERRO: Variação sem audio. refAudioServerUrl vazio para:', variationId)
      return NextResponse.json(
        { error: 'Variação não possui áudio de referência. Faça upload do áudio primeiro.' },
        { status: 400 }
      )
    }

    // Gerar speakerFile limpo: voz_variacao.wav
    const slugify = (s: string) => s
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

    const voiceSlug = slugify(variation.voice.name)
    const varSlug = slugify(variation.label)
    const speakerFile = `${voiceSlug}_${varSlug}.wav`
    const speakerName = `${variation.voice.name} — ${variation.label}`

    console.log('[SpeakerConvert] speakerFile gerado:', speakerFile)
    console.log('[SpeakerConvert] refAudioServerUrl:', variation.refAudioServerUrl.substring(0, 80))

    if (enable === false) {
      // DESATIVAR
      console.log('[SpeakerConvert] Acao: DESATIVAR')
      const deleted = await db.speaker.deleteMany({
        where: { speakerFile },
      })
      console.log('[SpeakerConvert] Deletados:', deleted.count, 'registros com speakerFile:', speakerFile)
      return NextResponse.json({
        success: true,
        message: `"${speakerName}" removido dos Locutores Oficiais`,
        speakerFile,
      })
    }

    // ATIVAR: upsert usando speakerFile como chave unica
    console.log('[SpeakerConvert] Acao: ATIVAR (upsert)')
    try {
      const speaker = await db.speaker.upsert({
        where: { speakerFile },
        update: {
          name: speakerName,
          isActive: true,
          refAudioUrl: variation.refAudioServerUrl,
          refText: variation.refText || '',
        },
        create: {
          name: speakerName,
          speakerFile: speakerFile,
          isActive: true,
          avatarUrl: null,
          refAudioUrl: variation.refAudioServerUrl,
          refText: variation.refText || '',
        },
      })

      console.log('[SpeakerConvert] UPSERT OK:', speaker.id, speaker.name, speaker.speakerFile)
      console.log('[SpeakerConvert] Tempo total:', Date.now() - startTime, 'ms')

      // Notificar GPU em background
      const tunnelUrl = process.env.AUDIO_SERVER_URL
      if (tunnelUrl) {
        fetch(`${tunnelUrl}/api/native-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prerender_embedding',
            speaker_id: speakerFile,
            ref_audio_url: variation.refAudioServerUrl,
            ref_text: variation.refText || '',
            original_filename: variation.refAudioFilename || speakerFile,
          }),
        }).catch(() => {
          console.log('[SpeakerConvert] GPU não respondeu para', speakerFile, '(fire-and-forget)')
        })
      }

      return NextResponse.json({
        success: true,
        message: `"${speakerName}" ativado como Locutor Oficial (embedding: ${speakerFile})`,
        speaker: { id: speaker.id, name: speaker.name, speakerFile: speaker.speakerFile },
        speakerFile,
      })
    } catch (dbError) {
      console.error('[SpeakerConvert] ERRO PRISMA UPSERT:', dbError)
      // Fallback: se upsert falhar por conflito, tenta update direto
      try {
        const existing = await db.speaker.findFirst({ where: { speakerFile } })
        if (existing) {
          const updated = await db.speaker.update({
            where: { id: existing.id },
            data: { name: speakerName, isActive: true },
          })
          console.log('[SpeakerConvert] FALLBACK UPDATE OK:', updated.id)
          return NextResponse.json({
            success: true,
            message: `"${speakerName}" reativado (fallback)`,
            speakerFile,
          })
        }
      } catch (fallbackError) {
        console.error('[SpeakerConvert] ERRO FALLBACK:', fallbackError)
      }
      const msg = dbError instanceof Error ? dbError.message : String(dbError)
      return NextResponse.json({ error: `Erro ao salvar no banco: ${msg}` }, { status: 500 })
    }
  } catch (error) {
    console.error('[SpeakerConvert] ERRO FATAL:', error)
    const msg = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
