const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  .then(r => { r.forEach(row => console.log(row.table_name)); })
  .catch(e => console.error('ERR:', e.message))
  .finally(() => db.$disconnect());
