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
import { getAdminSession } from '@/lib/auth'

// Ler env vars em tempo de execução (não em tempo de build)
function getAudioServerUrl(): string {
  return process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
}
function getAudioServerApiKey(): string {
  return process.env.AUDIO_SERVER_API_KEY || 'omnivoice_sk_2024_secure_key_v4'
}

export const maxDuration = 60

// POST /api/upload-chunk - Proxy individual chunk to PHP upload.php (chunked mode)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const chunkData = formData.get('chunkData') as File | null
    const chunkIndex = formData.get('chunkIndex') as string | null
    const totalChunks = formData.get('totalChunks') as string | null
    const fileName = formData.get('fileName') as string | null
    const fileId = formData.get('fileId') as string | null
    const tipo = formData.get('tipo') as string | null

    if (!chunkData || chunkIndex === null || totalChunks === null || !fileName || !fileId) {
      return NextResponse.json(
        { error: 'Parâmetros incompletos' },
        { status: 400 }
      )
    }

    // Send chunk to PHP upload.php (server-to-server, no CORS issues)
    // upload.php auto-detects chunked mode via chunkIndex/totalChunks/fileId params
    const phpFormData = new FormData()
    phpFormData.append('chunkData', chunkData, 'chunk')
    phpFormData.append('chunkIndex', chunkIndex)
    phpFormData.append('totalChunks', totalChunks)
    phpFormData.append('fileName', fileName)
    phpFormData.append('fileId', fileId)
    phpFormData.append('tipo', tipo || 'track')

    const phpRes = await fetch(`${getAudioServerUrl()}/upload.php`, {
      method: 'POST',
      headers: {
        ...(getAudioServerApiKey() ? { 'Authorization': `Bearer ${getAudioServerApiKey()}` } : {}),
      },
      body: phpFormData,
    })

    // Ler resposta como texto primeiro (evita crash se PHP retornar HTML/erro)
    let responseText = ''
    try {
      responseText = await phpRes.text()
    } catch {
      return NextResponse.json(
        { error: `Servidor PHP nao respondeu (chunk ${chunkIndex}/${totalChunks})` },
        { status: 502 }
      )
    }

    // Verificar se a resposta e JSON valido
    let data: Record<string, unknown>
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error(`[UploadChunk] Resposta invalida do PHP (chunk ${chunkIndex}):`, responseText.substring(0, 200))
      return NextResponse.json(
        { error: `Servidor PHP retornou resposta invalida. Faca o upload do upload.php atualizado no servidor PHP.` },
        { status: 502 }
      )
    }

    if (!data.sucesso) {
      return NextResponse.json(
        { error: (data.erro as string) || 'Erro no servidor PHP' },
        { status: phpRes.status }
      )
    }

    return NextResponse.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      totalChunks: parseInt(totalChunks),
      status: data.chunked ? 'complete' : 'partial',
      ...(data.chunked ? {
        path: data.url,
        filename: data.arquivo,
        size: data.tamanho,
      } : {}),
    })
  } catch (error) {
    console.error('Upload chunk error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload do chunk' },
      { status: 500 }
    )
  }
}
