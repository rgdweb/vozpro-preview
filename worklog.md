---
Task ID: 1
Agent: main
Task: Investigar e corrigir corte de áudio no final das frases geradas pelo OmniVoice

Work Log:
- Fez auditoria completa de TODO o codebase procurando applyFadeOut, fadeOutMs, crossfadeMs, trimEndSilence
- Confirmou que todos os fades e trims anteriores foram corretamente desativados nos commits f828298 e 7841596
- Identificou que `postprocess_output: true` na linha 454 de tunnel-generate/route.ts fazia o próprio modelo OmniVoice cortar silêncio do final — cortando a última sílaba junto
- Alterou `postprocess_output` de `true` para `false` com comentário explicativo
- Commit c40cd6a enviado ao GitHub/Vercel

Stage Summary:
- Arquivo editado: src/app/api/tunnel-generate/route.ts (linha 454)
- Mudança: postprocess_output true → false
- Commit: c40cd6a — já enviado ao GitHub, Vercel deve auto-deploy
