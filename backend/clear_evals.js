const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.vehicleEvaluation.deleteMany({})
  .then(r => console.log('Deleted', r.count, 'cached evaluations'))
  .finally(() => p.$disconnect());
