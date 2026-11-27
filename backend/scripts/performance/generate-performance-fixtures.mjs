import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// shortcut: emit a neutral fixture contract first; domain-specific MongoDB
// inserts stay behind the existing feature migrations and service commands.
const outputArg = process.argv.find(value => value.startsWith('--output='));
const countArg = process.argv.find(value => value.startsWith('--count='));
const outputPath = resolve(outputArg?.slice('--output='.length) ?? 'storage/performance/fixtures.json');
const count = Math.max(1, Math.min(10000, Number(countArg?.slice('--count='.length) ?? 100)));

function id(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(5, '0')}`;
}

function stableNumber(value) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}

const fixtures = {
  generatedAt: new Date().toISOString(),
  synthetic: true,
  count,
  users: Array.from({ length: count }, (_, index) => ({
    fixtureKey: id('user', index),
    role: index % 10 === 0 ? 'PET_SITTER' : 'CUSTOMER',
    email: `${id('user', index)}@example.test`
  })),
  sitters: Array.from({ length: Math.max(2, Math.ceil(count / 10)) }, (_, index) => ({
    fixtureKey: id('sitter', index),
    role: 'PET_SITTER',
    areaCode: `HN-${(index % 12) + 1}`,
    capacity: 2 + (index % 3)
  })),
  products: Array.from({ length: Math.max(10, Math.ceil(count / 5)) }, (_, index) => ({
    fixtureKey: id('product', index),
    code: `PERF-${String(index + 1).padStart(5, '0')}`,
    sellingPrice: 10000 + (stableNumber(`product-${index}`) % 90000),
    stockOnHand: 1000
  })),
  bookings: Array.from({ length: count }, (_, index) => ({
    fixtureKey: id('booking', index),
    customerFixtureKey: id('user', index),
    sitterFixtureKey: id('sitter', index % Math.max(2, Math.ceil(count / 10))),
    state: index % 4 === 0 ? 'AWAITING_PAYMENT' : 'CONFIRMED',
    idempotencyKey: `perf-booking-${index + 1}`
  })),
  payments: Array.from({ length: count }, (_, index) => ({
    fixtureKey: id('payment', index),
    bookingFixtureKey: id('booking', index),
    state: index % 3 === 0 ? 'PENDING' : 'PAID',
    provider: 'payOS',
    providerOrderCode: 900000 + index
  })),
  jobs: Array.from({ length: count }, (_, index) => ({
    fixtureKey: id('job', index),
    type: index % 2 === 0 ? 'OFFER_DISPATCH' : 'NOTIFICATION_OUTBOX',
    state: index % 5 === 0 ? 'RETRY' : 'READY',
    attempts: index % 5 === 0 ? 1 : 0
  }))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(JSON.stringify({ state: 'GENERATED', output: outputPath, count }, null, 2));
