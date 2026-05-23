import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

try {
  // Verificar extensões disponíveis no Neon para backups
  const exts = await p.$queryRawUnsafe(`SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net', 'timescaledb', 'pg_repack')`);
  console.log('Extensions:', exts);

  // Verificar slots de replicação (para point-in-time recovery)
  const slots = await p.$queryRawUnsafe(`SELECT slot_name, slot_type, active FROM pg_replication_slots`);
  console.log('Replication slots:', slots);

  // Verificar histórico de queries do Neon (se disponível)
  try {
    const neonHistory = await p.$queryRawUnsafe(`SELECT * FROM neondb.neon_branches LIMIT 5`);
    console.log('Neon branches:', neonHistory);
  } catch(e2) {
    console.log('Neon branches: não disponível');
  }

  // Pegar o OID dos schemas pra ver se foi recriado
  const schemaInfo = await p.$queryRawUnsafe(`
    SELECT relname, relfilenode, oid
    FROM pg_class
    WHERE relname IN ('Voice', 'Track', 'VoiceVariation', 'User', 'SystemSetting')
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY relname
  `);
  console.log('\nTable OIDs (se são novos = dados foram dropados):');
  for (const t of schemaInfo) {
    console.log(`  ${t.relname}: OID=${t.oid}, filenode=${t.relfilenode}`);
  }
} catch (err) {
  console.error('ERRO:', err.message);
}
await p.$disconnect();
