const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.$queryRaw`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='GenerationQueue' ORDER BY ordinal_position`
  .then(r => { r.forEach(row => console.log(JSON.stringify(row))); })
  .catch(e => console.error('ERR:', e.message))
  .finally(() => db.$disconnect());
