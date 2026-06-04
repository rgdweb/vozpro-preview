import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// Configuração SMTP via variáveis de ambiente
// SMTP_HOST=smtp.gmail.com
// SMTP_PORT=587
// SMTP_USER=seu-email@gmail.com
// SMTP_PASS=sua-app-password
// EMAIL_FROM=VozPro <seu-email@gmail.com>

interface SendEmailRequest {
  email: string
  audioBase64: string  // data URI (data:audio/wav;base64,...)
  format: 'mp3' | 'wav'
  fileName?: string
}

function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.EMAIL_FROM || `${user}`

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  })
}

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Formato de data URI inválido')
  }
  const mimeType = matches[1]
  const base64 = matches[2]
  const buffer = Buffer.from(base64, 'base64')
  return { buffer, mimeType }
}

export async function POST(request: NextRequest) {
  try {
    const body: SendEmailRequest = await request.json()
    const { email, audioBase64, format, fileName } = body

    // Validações
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    if (!audioBase64 || !audioBase64.startsWith('data:audio/')) {
      return NextResponse.json({ error: 'Áudio inválido' }, { status: 400 })
    }

    if (!format || !['mp3', 'wav'].includes(format)) {
      return NextResponse.json({ error: 'Formato inválido. Use mp3 ou wav.' }, { status: 400 })
    }

    // Verificar se SMTP está configurado
    const transporter = getTransporter()
    if (!transporter) {
      return NextResponse.json(
        { error: 'Email não configurado. Configure SMTP_HOST, SMTP_USER e SMTP_PASS no painel admin.' },
        { status: 503 }
      )
    }

    // Converter base64 para buffer
    let audioBuffer: Buffer
    let mimeType: string
    try {
      const result = dataUriToBuffer(audioBase64)
      audioBuffer = result.buffer
      mimeType = result.mimeType
    } catch {
      return NextResponse.json({ error: 'Erro ao processar áudio. Tente gerar novamente.' }, { status: 400 })
    }

    // Verificar tamanho (máximo 15MB para email)
    const maxSize = 15 * 1024 * 1024
    if (audioBuffer.length > maxSize) {
      return NextResponse.json(
        { error: `Áudio muito grande (${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB). Máximo: 15MB. Baixe diretamente.` },
        { status: 400 }
      )
    }

    // Verificar se o formato bate com o mime type
    const expectedMime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
    if (!mimeType.includes(expectedMime.split('/')[1]) && mimeType !== expectedMime) {
      // Tolerância: aceitar audio/wave como audio/wav
      if (!(format === 'wav' && mimeType === 'audio/wave')) {
        // Não bloquear, mas usar o mime correto
      }
    }

    // Nome do arquivo
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const finalFileName = fileName || `vozpro_${timestamp}_${Date.now()}.${format}`

    // Configurar email
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'VozPro'
    const mailOptions = {
      from,
      to: email,
      subject: 'Seu áudio VozPro está pronto! 🎙️',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-radius: 16px; overflow: hidden;">
          <div style="padding: 32px; text-align: center;">
            <div style="font-size: 40px; margin-bottom: 16px;">🎙️</div>
            <h1 style="color: #c4b5fd; font-size: 24px; margin: 0 0 8px 0;">VozPro</h1>
            <p style="color: #a78bfa; font-size: 14px; margin: 0 0 24px 0;">Vozes Profissionais com IA</p>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 24px 32px;">
            <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 12px 0;">Seu áudio está pronto!</h2>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
              Olá! O áudio que você gerou no VozPro está attachedo neste email no formato <strong style="color: #c4b5fd;">${format.toUpperCase()}</strong>.
            </p>
            <div style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <p style="color: #a78bfa; font-size: 13px; margin: 0;">
                📎 <strong>Arquivo:</strong> ${finalFileName}<br>
                📊 <strong>Tamanho:</strong> ${(audioBuffer.length / 1024).toFixed(0)} KB<br>
                🎵 <strong>Formato:</strong> ${format.toUpperCase()}
              </p>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              Gere mais áudios profissionais em vozpro.com.br
            </p>
          </div>
          <div style="padding: 16px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
            <p style="color: #64748b; font-size: 11px; margin: 0;">VozPro &copy; ${new Date().getFullYear()} — Vozes Profissionais com IA</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: finalFileName,
          content: audioBuffer,
          contentType: mimeType,
        },
      ],
    }

    // Enviar email
    const info = await transporter.sendMail(mailOptions)

    return NextResponse.json({
      success: true,
      message: `Áudio enviado para ${email} com sucesso!`,
      messageId: info.messageId,
    })
  } catch (error: unknown) {
    console.error('Erro ao enviar email:', error)
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'

    if (msg.includes('Invalid login') || msg.includes('authentication')) {
      return NextResponse.json(
        { error: 'Erro de autenticação SMTP. Verifique SMTP_USER e SMTP_PASS.' },
        { status: 500 }
      )
    }

    if (msg.includes('Connection timeout') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
      return NextResponse.json(
        { error: 'Não foi possível conectar ao servidor SMTP. Tente novamente.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: `Erro ao enviar email: ${msg}` },
      { status: 500 }
    )
  }
}

// Endpoint para verificar se email está configurado
export async function GET() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.EMAIL_FROM

  const configured = !!(host && user && pass)

  return NextResponse.json({
    configured,
    from: from || user || null,
    // Não expor a senha
    smtpHost: host || null,
    smtpPort: process.env.SMTP_PORT || '587',
  })
}
