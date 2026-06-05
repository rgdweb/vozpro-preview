#!/usr/bin/env python3
"""OmniVoice/VozPro - Documentacao completa de infraestrutura e migracao."""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Fonts ──
pdfmetrics.registerFont(TTFont('Sans', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('SansB', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('Sans', normal='Sans', bold='SansB')
registerFontFamily('Serif', normal='Serif', bold='Serif')
registerFontFamily('DejaVu', normal='DejaVu', bold='DejaVu')

# ── Palette ──
ACCENT = colors.HexColor('#582ed8')
TEXT_PRIMARY = colors.HexColor('#23221f')
TEXT_MUTED = colors.HexColor('#838077')
BG_SURFACE = colors.HexColor('#e4e2dd')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_ODD = BG_SURFACE

# ── Styles ──
s = ParagraphStyle('Body', fontName='Sans', fontSize=10.5, leading=17, alignment=TA_LEFT, spaceAfter=6)
s_h1 = ParagraphStyle('H1', fontName='Sans', fontSize=18, leading=24, textColor=ACCENT, spaceBefore=18, spaceAfter=10)
s_h2 = ParagraphStyle('H2', fontName='Sans', fontSize=14, leading=20, textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8)
s_h3 = ParagraphStyle('H3', fontName='Sans', fontSize=12, leading=17, textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6)
s_code = ParagraphStyle('Code', fontName='DejaVu', fontSize=8.5, leading=13, backColor=colors.HexColor('#f5f3f0'), leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=4)
s_caption = ParagraphStyle('Caption', fontName='Sans', fontSize=9, leading=13, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
s_hdr = ParagraphStyle('TblHdr', fontName='Sans', fontSize=10, leading=14, textColor=colors.white, alignment=TA_CENTER)
s_cell = ParagraphStyle('TblCell', fontName='Sans', fontSize=9.5, leading=14, alignment=TA_LEFT)
s_cell_c = ParagraphStyle('TblCellC', fontName='Sans', fontSize=9.5, leading=14, alignment=TA_CENTER)

OUT = '/home/z/my-project/download/omnivoice-migration/documentacao-infraestrutura.pdf'

def P(text, style=s):
    return Paragraph(text, style)

def make_table(headers, rows, col_widths=None):
    hdrs = [P(f'<b>{h}</b>', s_hdr) for h in headers]
    data = [hdrs]
    for row in rows:
        data.append([P(str(c), s_cell) if not isinstance(c, Paragraph) else c for c in row])
    avail = A4[0] - 2*inch
    if col_widths is None:
        n = len(headers)
        col_widths = [avail / n] * n
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def hr():
    return HRFlowable(width='100%', thickness=0.5, color=TEXT_MUTED, spaceBefore=6, spaceAfter=6)

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=1*inch, rightMargin=1*inch,
                         topMargin=0.8*inch, bottomMargin=0.8*inch,
                         title='OmniVoice/VozPro - Documentacao de Infraestrutura',
                         author='Z.ai', subject='Infraestrutura e Migracao')

story = []

# ══════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 120))
story.append(P('<b>OmniVoice / VozPro</b>', ParagraphStyle('CoverTitle', fontName='Sans', fontSize=32, leading=40, textColor=ACCENT, alignment=TA_CENTER)))
story.append(Spacer(1, 20))
story.append(P('Documentacao de Infraestrutura e Migracao', ParagraphStyle('CoverSub', fontName='Sans', fontSize=16, leading=22, textColor=TEXT_PRIMARY, alignment=TA_CENTER)))
story.append(Spacer(1, 30))
story.append(hr())
story.append(Spacer(1, 10))
story.append(P('Oracle Cloud: 147.15.77.137', ParagraphStyle('CoverMeta', fontName='Sans', fontSize=11, leading=16, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(P('Data: 02/06/2026', ParagraphStyle('CoverMeta2', fontName='Sans', fontSize=11, leading=16, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(P('Migracao: Gradio API -> native-generate', ParagraphStyle('CoverMeta3', fontName='Sans', fontSize=11, leading=16, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# 1. VISAO GERAL DA INFRAESTRUTURA
# ══════════════════════════════════════════════════════════════════
story.append(P('<b>1. Visao Geral da Infraestrutura</b>', s_h1))
story.append(hr())

story.append(P('O sistema OmniVoice/VozPro opera em uma arquitetura distribuida entre tres maquinas: o servidor Oracle Cloud (147.15.77.137), que hospeda o PHP backend e o frontend Next.js; a maquina local do usuario com GPU RTX 3060, que executa o modelo OmniVoice e gera audio; e o servico de tunnel Cloudflare, que conecta os dois securely. A comunicacao entre o Oracle e a GPU local e feita exclusivamente via tunnel criptografado, eliminando a necessidade de portas abertas no firewall da rede local.', s))

story.append(Spacer(1, 12))
story.append(P('<b>1.1 Componentes Ativos</b>', s_h2))

story.append(make_table(
    ['Componente', 'Localizacao', 'Funcao'],
    [
        ['Nginx + PHP-FPM', 'Oracle (147.15.77.137)', 'Serve API PHP + proxy reverso pro Next.js'],
        ['Next.js (standalone)', 'Oracle /home/ubuntu/omnivoice/', 'Frontend web do VozPro (PM2)'],
        ['OmniVoice GPU', 'Maquina local (RTX 3060)', 'Modelo TTS OmniVoice via Python'],
        ['Cloudflare Tunnel', 'Maquina local', 'Expoe GPU local na internet'],
        ['PostgreSQL', 'Oracle localhost:5432', 'Banco de dados do VozPro'],
    ],
    [130, 160, 180]
))
story.append(P('Tabela 1: Componentes ativos do sistema', s_caption))
story.append(Spacer(1, 12))

story.append(P('<b>1.2 Dominios e Sub-dominios</b>', s_h2))

story.append(P('O sistema utiliza multiplos dominios, todos configurados no Nginx do servidor Oracle. Cada dominio aponta para um componente especifico da infraestrutura. O dominio principal do produto e vozprooff.com.br, enquanto os sub-dominios cvmnews.com.br sao usados para a API e o frontend.', s))

story.append(make_table(
    ['Dominio', 'Proxy Para', 'Tipo', 'SSL'],
    [
        ['api.cvmnews.com.br', '/var/www/omnivoice/ (PHP)', 'PHP-FPM direto', 'Let Encrypt'],
        ['api.sorteiomax.com.br', '/var/www/omnivoice/ (PHP)', 'PHP-FPM direto', 'Let Encrypt'],
        ['vozpro.cvmnews.com.br', '127.0.0.1:3001 (Next.js)', 'Reverse proxy', 'Let Encrypt'],
        ['vozprooff.com.br', '127.0.0.1:3001 (Next.js)', 'Reverse proxy', 'Let Encrypt'],
    ],
    [130, 150, 100, 90]
))
story.append(P('Tabela 2: Mapeamento de dominios no Nginx', s_caption))

story.append(Spacer(1, 12))
story.append(P('<b>1.3 Apps no PM2</b>', s_h2))

story.append(P('O gerenciador de processos PM2 controla os servicos Node.js no Oracle. Atualmente, dois processos estao ativos: o omnivoice (frontend VozPro) e o osfy (aplicativo separado). O PM2 garante restart automatico em caso de falha e gerencia os logs de cada processo.', s))

story.append(make_table(
    ['PM2 ID', 'Nome', 'Script', 'Porta', 'Status'],
    [
        [P('0', s_cell_c), 'omnivoice', '/home/ubuntu/omnivoice/.next/standalone/server.js', P('3001', s_cell_c), 'online'],
        [P('1', s_cell_c), 'osfy', 'cluster mode', P('3000', s_cell_c), 'online'],
    ],
    [50, 80, 230, 50, 60]
))
story.append(P('Tabela 3: Processos PM2 ativos', s_caption))

story.append(Spacer(1, 12))
story.append(P('<b>1.4 vozpro-app (Deployment Antigo)</b>', s_h2))

story.append(P('Existe um diretorio /var/www/vozpro-app/ no Oracle que representa um deployment antigo do VozPro. Este deployment NAO esta ativo no PM2 e NAO esta sendo servido pelo Nginx para nenhum dominio. O diretorio contem um arquivo ecosystem.config.js que referencia port 3001 e um build .next, porem o PM2 nao esta rodando este processo.', s))

story.append(P('O sub-dominio vozpro.cvmnews.com.br, que anteriormente poderia ter apontado para este deployment, agora faz proxy para 127.0.0.1:3001, que e o processo omnivoice (deploy atual em /home/ubuntu/omnivoice/). Ou seja, o vozpro-app e um deployment fantasma que pode ser removido com seguranca.', s))

story.append(make_table(
    ['Item', 'Valor'],
    [
        ['Diretorio', '/var/www/vozpro-app/'],
        ['Conteudo', '.env, ecosystem.config.js, .next/'],
        ['PM2', 'NAO registrado (inativo)'],
        ['Nginx', 'NENHUM server block aponta para este diretorio'],
        ['Status', 'OBFOSOLETO - pode ser removido'],
    ],
    [120, 350]
))
story.append(P('Tabela 4: vozpro-app - deployment obsoleto', s_caption))

# ══════════════════════════════════════════════════════════════════
# 2. ESTRUTURA DE ARQUIVOS
# ══════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(P('<b>2. Estrutura de Arquivos no Oracle</b>', s_h1))
story.append(hr())

story.append(P('<b>2.1 PHP Backend (/var/www/omnivoice/)</b>', s_h2))
story.append(P('Este diretorio contem todos os endpoints PHP da API de audio. O Nginx serve estes arquivos via PHP-FPM 8.3 para os dominios api.cvmnews.com.br e api.sorteiomax.com.br. Cada arquivo tem uma funcao especifica no pipeline de geracao de voz.', s))

story.append(make_table(
    ['Arquivo', 'Funcao', 'Metodo'],
    [
        ['generate-omnivoice.php', 'Geracao TTS principal (PHP direto do browser)', 'native-generate'],
        ['tunnel-generate.php', 'Proxy PHP para geracao nativa via tunnel', 'native-generate'],
        ['generate-direct.php', 'Geracao direta alternativa', 'Gradio (antigo)'],
        ['generate.php', 'Geracao original via Vercel', 'Vercel'],
        ['config.php', 'Configuracoes (API key, URLs, constantes)', 'N/A'],
        ['get_tunnel.php', 'Retorna URL do tunnel ativo', 'N/A'],
        ['tunnel-config.ini', 'URL do tunnel (atualizada pelo cloudflared)', 'N/A'],
        ['update_tunnel.php', 'Recebe nova URL do tunnel do cloudflared', 'N/A'],
        ['upload.php', 'Upload de audio de referencia', 'N/A'],
        ['health.php', 'Health check do sistema', 'N/A'],
    ],
    [130, 230, 100]
))
story.append(P('Tabela 5: Arquivos PHP do backend', s_caption))

story.append(Spacer(1, 12))
story.append(P('<b>2.2 Next.js Frontend (/home/ubuntu/omnivoice/)</b>', s_h2))
story.append(P('O frontend Next.js esta em /home/ubuntu/omnivoice/ e roda como standalone server via PM2 na porta 3001. O build esta em .next/standalone/server.js. O .env contem as variaveis de ambiente incluindo DATABASE_URL, NEXTAUTH_URL, AUDIO_SERVER_URL e a API key.', s))

story.append(P('<b>2.3 Arquivo .env (variaveis de ambiente)</b>', s_h3))

story.append(make_table(
    ['Variavel', 'Valor'],
    [
        ['DATABASE_URL', 'postgresql://omnivoice:***@127.0.0.1:5432/omnivoice'],
        ['AUDIO_SERVER_URL', 'https://api.cvmnews.com.br'],
        ['NEXT_PUBLIC_AUDIO_SERVER_URL', 'https://api.cvmnews.com.br'],
        ['NEXTAUTH_URL', 'https://vozprooff.com.br'],
        ['ADMIN_PASSWORD', 'VozPro@2026'],
        ['JWT_SECRET', 'vozpro-production-jwt-secret-2026'],
        ['AUDIO_SERVER_API_KEY', 'omnivoice_api_key_2026_secure'],
        ['PORT', '3001'],
    ],
    [180, 290]
))
story.append(P('Tabela 6: Variaveis de ambiente do Next.js', s_caption))

# ══════════════════════════════════════════════════════════════════
# 3. FLUXO DE GERACAO DE AUDIO
# ══════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(P('<b>3. Fluxo de Geracao de Audio (Apos Migracao)</b>', s_h1))
story.append(hr())

story.append(P('A migracao de 02/06/2026 unificou o sistema para usar exclusivamente o endpoint /api/native-generate, eliminando a dependencia do Gradio API que era a fonte de lentidao e instabilidade. Antes da migracao, o generate-omnivoice.php usava o Gradio (3 etapas complexas), enquanto o tunnel-generate.php ja usava native-generate. Agora ambos usam o mesmo metodo.', s))

story.append(Spacer(1, 12))
story.append(P('<b>3.1 Fluxo Atual (native-generate)</b>', s_h2))

steps = [
    '1. Browser do usuario envia JSON POST para api.cvmnews.com.br/generate-omnivoice.php',
    '2. PHP valida token HMAC e processa input (strip SSML, clean text, clamp speed 0.5-1.5)',
    '3. PHP descobre tunnel URL via tunnel-config.ini ou get_tunnel.php',
    '4. Se modo clone: PHP baixa audio de referencia, converte para base64',
    '5. PHP monta payload JSON e envia POST para tunnel/api/native-generate',
    '6. GPU local recebe JSON, executa OmniVoice, retorna audio como base64',
    '7. PHP recebe resposta, adiciona silence pad (750ms), converte para data URI',
    '8. PHP retorna data URI (audio/wav;base64,...) para o browser',
]
for step in steps:
    story.append(P(step, s_code))

story.append(Spacer(1, 12))
story.append(P('<b>3.2 Antes vs Depois da Migracao</b>', s_h2))

story.append(make_table(
    ['Aspecto', 'Antes (Gradio)', 'Depois (native-generate)'],
    [
        ['Etapas', '3 (upload + submit + SSE stream)', '1 (JSON POST direto)'],
        ['Protocolo', 'Gradio API (multipart + SSE)', 'REST JSON (POST + response)'],
        ['Tempo tipico', '15-45s (variavel)', '5-15s (estavel)'],
        ['Ponto de falha', '3 (upload, submit, stream)', '1 (POST unico)'],
        ['Retry necessario', 'Frequente (timeout, 404)', 'Raro (1 retry basta)'],
        ['Download audio', 'Separado via URL do Gradio', 'Embutido no response (base64)'],
        ['Complexidade PHP', '856 linhas', '512 linhas (-40%)'],
    ],
    [100, 160, 210]
))
story.append(P('Tabela 7: Comparacao antes/depois da migracao', s_caption))

# ══════════════════════════════════════════════════════════════════
# 4. MIGRACAO REALIZADA
# ══════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(P('<b>4. Migracao Realizada (02/06/2026)</b>', s_h1))
story.append(hr())

story.append(P('<b>4.1 Resumo da Migracao</b>', s_h2))
story.append(P('A migracao consistiu em reescrever o arquivo generate-omnivoice.php para usar o endpoint /api/native-generate em vez da API Gradio. Todas as funcionalidades foram preservadas: validacao HMAC, debug logging, queue monitor, SSML strip, clean text, WAV silence pad, retry logic e speed clamping. O arquivo foi reduzido de 856 para 512 linhas (-40% de complexidade).', s))

story.append(Spacer(1, 12))
story.append(P('<b>4.2 Backups Criados</b>', s_h2))

story.append(make_table(
    ['Backup', 'Caminho', 'Tipo'],
    [
        ['Backup completo PHP', '/var/www/omnivoice-backup-20250602/', 'cp -a (completo)'],
        ['Backup Gradio do PHP', '/var/www/omnivoice/generate-omnivoice.php.gradio-backup-*', 'cp individual'],
        ['Backup Next.js source', '/home/ubuntu/omnivoice-backup-20250602/src/', 'cp -a'],
        ['Backup .env', '/home/ubuntu/omnivoice-backup-20250602/.env.backup', 'cp individual'],
        ['Backup next.config.ts', '/home/ubuntu/omnivoice-backup-20250602/next.config.ts.backup', 'cp individual'],
        ['Backup package.json', '/home/ubuntu/omnivoice-backup-20250602/package.json.backup', 'cp individual'],
    ],
    [130, 260, 80]
))
story.append(P('Tabela 8: Backups criados antes da migracao', s_caption))

story.append(Spacer(1, 12))
story.append(P('<b>4.3 Features Preservadas na Migracao</b>', s_h2))

features = [
    ['Validacao HMAC token', 'Verifica assinatura timestamp+HMAC com API_KEY'],
    ['Debug logging', 'Steps com timing para diagnostico de problemas'],
    ['Queue monitor', 'JSON em /tmp/vp_queue_monitor.json'],
    ['SSML strip', 'Remove tags HTML/XML do texto de entrada'],
    ['Clean text', 'Remove caracteres de controle invisiveis'],
    ['WAV silence pad', 'Adiciona 750ms de silencio no final (protege ultima silaba)'],
    ['Retry logic', '3 tentativas com backoff exponencial'],
    ['Speed clamping', 'Limita speed entre 0.5 e 1.5 (range oficial OmniVoice)'],
    ['3 modos', 'clone (ref audio), design (instruct), auto (modelo escolhe)'],
    ['3 modos (antigo)', 'clone (_clone_fn), design (_design_fn), auto (_design_fn)'],
]
story.append(make_table(
    ['Feature', 'Descricao'],
    features,
    [120, 350]
))
story.append(P('Tabela 9: Features preservadas na migracao', s_caption))

story.append(Spacer(1, 12))
story.append(P('<b>4.4 Testes Realizados</b>', s_h2))

story.append(make_table(
    ['Teste', 'Resultado'],
    [
        ['PHP syntax check', 'No syntax errors detected'],
        ['Endpoint native-generate', 'Sucesso: 2.04s audio em 0.69s (130KB)'],
        ['Referencias Gradio no PHP', 'Zero em codigo produtivo (1 no comentario)'],
        ['Referencias hf.space nos PHPs', 'Zero'],
        ['Backup integridade', 'Arquivos presentes e acessiveis'],
    ],
    [200, 270]
))
story.append(P('Tabela 10: Resultados dos testes pos-migracao', s_caption))

# ══════════════════════════════════════════════════════════════════
# 5. TUNNEL CONFIGURATION
# ══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 12))
story.append(P('<b>5. Sistema de Tunnel</b>', s_h1))
story.append(hr())

story.append(P('O tunnel Cloudflare e o componente que conecta o servidor Oracle a GPU local. O cloudflared roda na maquina local do usuario e cria um tunnel HTTPS que expoe o servidor Python da GPU na internet com uma URL aleatoria do tipo *.trycloudflare.com. O Oracle descobre esta URL dinamicamente e a usa para enviar requisicoes de geracao.', s))

story.append(Spacer(1, 8))
story.append(P('<b>5.1 Fluxo de Descoberta do Tunnel</b>', s_h2))

tunnel_steps = [
    '1. O script start_tunnel.ps1 na maquina local inicia o cloudflared',
    '2. O cloudflared cria tunnel e gera URL aleatoria (ex: improved-mostly-accommodation-yacht.trycloudflare.com)',
    '3. O script chama update_tunnel.php no Oracle para registrar a URL',
    '4. O update_tunnel.php salva a URL em tunnel-config.ini',
    '5. O generate-omnivoice.php le tunnel-config.ini para descobrir a URL ativa',
    '6. Fallback: se tunnel-config.ini nao existir, usa get_tunnel.php ou HF_SPACE_URL',
]
for step in tunnel_steps:
    story.append(P(step, s_code))

story.append(Spacer(1, 8))
story.append(P('<b>5.2 Configuracao Atual do Tunnel</b>', s_h2))

story.append(make_table(
    ['Item', 'Valor'],
    [
        ['tunnel_url', 'https://improved-mostly-accommodation-yacht.trycloudflare.com'],
        ['updated_at', '2026-06-01 10:40:29'],
        ['Arquivo config', '/var/www/omnivoice/tunnel-config.ini'],
        ['Script de update', '/var/www/omnivoice/update_tunnel.php'],
        ['Script de leitura', '/var/www/omnivoice/get_tunnel.php'],
    ],
    [120, 350]
))
story.append(P('Tabela 11: Configuracao atual do tunnel', s_caption))

# ══════════════════════════════════════════════════════════════════
# 6. ROLLBACK
# ══════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(P('<b>6. Procedimento de Rollback</b>', s_h1))
story.append(hr())

story.append(P('Se a migracao causar qualquer problema, o rollback e simples e rapido. Existem dois niveis de rollback: o individual (restaurar apenas o PHP) e o completo (restaurar tudo do backup). Ambos sao nao-destrutivos, ou seja, o backup nunca e sobrescrito.', s))

story.append(Spacer(1, 8))
story.append(P('<b>6.1 Rollback Individual (PHP apenas)</b>', s_h2))
story.append(P('Este e o rollback recomendado para a maioria dos problemas. Restaura apenas o generate-omnivoice.php para a versao Gradio anterior. Executar via SSH no Oracle:', s))

story.append(P('sudo cp /var/www/omnivoice/generate-omnivoice.php.gradio-backup-* \\', s_code))
story.append(P('     /var/www/omnivoice/generate-omnivoice.php', s_code))
story.append(P('sudo chown www-data:www-data /var/www/omnivoice/generate-omnivoice.php', s_code))

story.append(Spacer(1, 8))
story.append(P('<b>6.2 Rollback Completo</b>', s_h2))
story.append(P('Restaura todos os arquivos do backup completo. Usar em caso de problema mais grave:', s))

story.append(P('sudo cp -a /var/www/omnivoice-backup-20250602/* /var/www/omnivoice/', s_code))
story.append(P('sudo cp -a /home/ubuntu/omnivoice-backup-20250602/src/* /home/ubuntu/omnivoice/src/', s_code))
story.append(P('sudo cp /home/ubuntu/omnivoice-backup-20250602/.env.backup /home/ubuntu/omnivoice/.env', s_code))
story.append(P('pm2 restart omnivoice', s_code))

# ══════════════════════════════════════════════════════════════════
# 7. ARQUIVOS PENDENTES DE LIMPEZA
# ══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 12))
story.append(P('<b>7. Arquivos Pendentes de Limpeza</b>', s_h1))
story.append(hr())

story.append(P('Apos a estabilizacao da migracao, alguns arquivos e diretorios podem ser removidos com seguranca para manter o servidor limpo. Nenhum destes itens esta em producao ativa.', s))

story.append(make_table(
    ['Item', 'Caminho', 'Motivo', 'Risco'],
    [
        ['vozpro-app', '/var/www/vozpro-app/', 'Deployment obsoleto, nao roda no PM2', 'Baixo'],
        ['HF_SPACE_URL', 'config.php (linha)', 'URL antiga do HF Space, nao mais usada', 'Baixo'],
        ['generate.php', '/var/www/omnivoice/', 'Geracao via Vercel (nao mais usado)', 'Medio'],
        ['generate-direct.php', '/var/www/omnivoice/', 'Ainda usa Gradio', 'Medio'],
        ['generate_local.php', '/var/www/omnivoice/', 'Local testing, nao produtivo', 'Baixo'],
        ['.next.bak.*', '/home/ubuntu/omnivoice/', 'Multiplos backups de build (.next)', 'Baixo'],
        ['.next.broken-*', '/home/ubuntu/omnivoice/', 'Builds quebrados', 'Baixo'],
    ],
    [100, 160, 130, 80]
))
story.append(P('Tabela 12: Arquivos passivos de limpeza', s_caption))

story.append(P('Recomendacao: aguardar 7 dias apos a migracao antes de remover qualquer arquivo. Se nao houver problemas, remover com backup previo.', s))

# ══════════════════════════════════════════════════════════════════
# 8. RESPOSTA: VOZPRO AINDA EXISTE?
# ══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 12))
story.append(P('<b>8. VozPro vs OmniVoice: Nomenclatura</b>', s_h1))
story.append(hr())

story.append(P('A nomenclatura do sistema pode causar confusao porque o nome do produto (VozPro) e diferente do nome do codigo (omnivoice). Aqui esta o mapeamento completo para evitar ambiguidade:', s))

story.append(make_table(
    ['Conceito', 'Nome', 'Onde esta'],
    [
        ['Produto/Marca', 'VozPro', 'vozprooff.com.br, vozpro.cvmnews.com.br'],
        ['Modelo TTS', 'OmniVoice', 'k2-fa/OmniVoice (HuggingFace)'],
        ['Frontend Next.js', 'omnivoice (PM2)', '/home/ubuntu/omnivoice/'],
        ['PHP Backend', 'omnivoice', '/var/www/omnivoice/'],
        ['Banco de dados', 'omnivoice', 'PostgreSQL: omnivoice@localhost'],
        ['GPU local', 'omnivoice_gpu.py', 'Maquina local do usuario'],
    ],
    [110, 130, 230]
))
story.append(P('Tabela 13: Mapeamento de nomenclatura', s_caption))

story.append(P('Resposta curta: o sub-dominio vozpro.cvmnews.com.br ainda existe no Nginx e faz proxy para o mesmo Next.js (porta 3001). Porem, o diretorio /var/www/vozpro-app/ e um deployment antigo que nao esta mais ativo. Todo o codigo atual esta em /home/ubuntu/omnivoice/ e /var/www/omnivoice/.', s))

# Build
doc.build(story)
print(f'PDF gerado: {OUT}')
print(f'Size: {os.path.getsize(OUT)} bytes')
