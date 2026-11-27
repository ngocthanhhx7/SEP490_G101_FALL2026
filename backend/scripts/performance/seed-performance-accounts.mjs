import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { userModel } from '../../src/models/user.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createSessionService } from '../../src/services/session.service.js';

const APPLY = process.argv.includes('--apply');
const outputArg = process.argv.find(value => value.startsWith('--output='));
const outputPath = resolve(outputArg?.slice('--output='.length) ?? 'storage/performance/sessions.json');
const roles = ['CUSTOMER', 'PET_SITTER', 'STAFF', 'SALE_STAFF', 'ADMIN'];

const accounts = roles.map((role, index) => ({
  role,
  fixtureKey: `pwc-performance-${role.toLowerCase()}-v1`,
  displayName: `Performance ${role.replace('_', ' ')}`,
  email: `performance-${role.toLowerCase()}@example.test`,
  index
}));

function safeLocalDatabase(config) {
  try {
    const uri = new URL(config.mongoUri);
    return config.nodeEnv === 'development'
      && config.database.endsWith('_dev')
      && ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)
      && ['27017', '27018', ''].includes(uri.port);
  } catch {
    return false;
  }
}

if (!APPLY) {
  console.log(JSON.stringify({
    state: 'DRY_RUN',
    accounts: accounts.map(({ role, fixtureKey, email }) => ({ role, fixtureKey, email })),
    output: outputPath,
    applyGuard: 'PERF_ALLOW_DB_WRITE=true plus local *_dev MongoDB only'
  }, null, 2));
} else {
  if (process.env.PERF_ALLOW_DB_WRITE !== 'true') {
    throw new Error('Refusing database write: set PERF_ALLOW_DB_WRITE=true explicitly');
  }

  let connection;
  try {
    const config = loadConfig();
    if (!safeLocalDatabase(config)) throw new Error('Refusing account seed outside local development MongoDB');
    if (!config.auth.enabled) throw new Error('AUTH_ENABLED=true is required to create sessions');

    connection = await connectDatabase(config);
    const User = userModel(connection);
    const models = identityModels(connection);
    const contactCrypto = createContactCrypto({
      lookupSecret: config.auth.contactLookupSecret,
      encryptionKey: config.auth.contactEncryptionKey
    });
    const sessionService = createSessionService({
      connection,
      User,
      models,
      tokenSecret: config.auth.tokenSecret,
      csrfSecret: config.auth.csrfSecret
    });
    const sessions = [];

    for (const account of accounts) {
      const user = await User.findOneAndUpdate({ fixtureKey: account.fixtureKey }, {
        $set: { displayName: account.displayName, roles: [account.role], state: 'ACTIVE', synthetic: false },
        $setOnInsert: { authEpoch: 0, version: 0, fixtureKey: account.fixtureKey }
      }, { upsert: true, returnDocument: 'after', runValidators: true });
      const contact = contactCrypto.lookup('EMAIL', account.email);
      await models.Contact.updateOne({ channel: 'EMAIL', lookupKey: contact.lookupKey }, {
        $setOnInsert: {
          userId: user._id,
          channel: 'EMAIL',
          canonicalCiphertext: contactCrypto.encrypt(contact.canonicalValue),
          lookupKey: contact.lookupKey,
          state: 'VERIFIED',
          verifiedAt: new Date()
        }
      }, { upsert: true, runValidators: true });
      const session = await sessionService.issueInTransaction(user);
      sessions.push({ role: account.role, userId: user._id.toString(), cookie: `${sessionService.cookieName}=${session.token}`, csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString() });
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), sessions }, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ state: 'APPLIED', accountCount: sessions.length, output: outputPath }, null, 2));
  } finally {
    await connection?.close();
  }
}
