const fs = require('node:fs');
const text = fs.readFileSync('prisma/schema.prisma', 'utf8');
const start = text.indexOf('enum LeadPublishStatus');
console.log(text.slice(start, start + 120));
