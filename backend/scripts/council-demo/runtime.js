import { randomBytes, randomInt } from 'node:crypto';
import express from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { ACCOUNT_ROLES } from '../../src/constants/account-roles.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';

export const COUNCIL_ORIGIN = 'http://council.pawworld.localhost:4388';
const host = new URL(COUNCIL_ORIGIN).host;
export const COUNCIL_OTP = '888888';
const accounts = ACCOUNT_ROLES.map(role => ({
  role, email: `${role.toLowerCase().replaceAll('_', '-')}@demo.pawworld.example`
}));
const emails = new Set(accounts.map(({ email }) => email));
const demoLogin = (purpose, channel, contact) => purpose === 'LOGIN' && channel === 'EMAIL' && emails.has(contact);

async function seedAccounts(connection, config) {
  const User = userModel(connection);
  const models = identityModels(connection);
  const crypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  await Promise.all([User, ...Object.values(models)].map(async model => {
    await model.createCollection();
    await model.createIndexes();
  }));
  await connection.transaction(async session => {
    for (const { role, email } of accounts) {
      const [user] = await User.create([{
        displayName: `Demo ${role}`, roles: [role], state: 'ACTIVE', fixtureKey: `council-${role}`
      }], { session });
      const { canonicalValue, lookupKey } = crypto.lookup('EMAIL', email);
      await models.Contact.create([{
        userId: user._id, channel: 'EMAIL', lookupKey, canonicalCiphertext: crypto.encrypt(canonicalValue),
        state: 'VERIFIED', verifiedAt: new Date()
      }], { session });
    }
  });
}

export async function createCouncilDemo({ frontendDirectory } = {}) {
  const replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' },
    instanceOpts: [{ ip: '127.0.0.1' }],
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  let connection;
  async function close() {
    try { await connection?.close(); }
    finally { await replica.stop(); }
  }

  try {
    const secret = () => randomBytes(32).toString('hex');
    // Construct a new configuration. Never load the standard runtime's .env.
    const env = {
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4388',
      MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_council_demo',
      AUTH_ENABLED: 'true', OTP_HMAC_SECRET: secret(), SESSION_TOKEN_SECRET: secret(),
      SESSION_CSRF_SECRET: secret(), CONTACT_LOOKUP_SECRET: secret(),
      CONTACT_ENCRYPTION_KEY: secret().slice(0, 32)
    };
    const config = loadConfig(env);
    connection = await connectDatabase(config);
    await seedAccounts(connection, config);
    const api = createApp({
      env, config, connection, lifecycle: { draining: false },
      createOtpCode: ({ purpose, channel, contact }) =>
        demoLogin(purpose, channel, contact) ? COUNCIL_OTP : String(randomInt(1_000_000)).padStart(6, '0'),
      portOverrides: { contactDelivery: { send: async ({ kind, purpose, channel, to, code }) =>
        kind === 'OTP' && demoLogin(purpose, channel, to) && code === COUNCIL_OTP
          ? { status: 'ACCEPTED', code: 'COUNCIL_DEMO' } : { status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' }
      } }
    });
    if (frontendDirectory) await provisionDemoCatalog({ connection });

    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      const origin = req.get('Origin');
      if (req.get('Host') !== host || (origin && origin !== COUNCIL_ORIGIN)) return res.sendStatus(403);
      return next();
    });
    if (frontendDirectory) {
      app.use(express.static(frontendDirectory));
      app.get(/^\/(?!api(?:\/|$)|health$|ready$).*/, (_req, res) => res.sendFile('index.html', { root: frontendDirectory }));
    }
    app.use(api);
    return { app, accounts: accounts.map(account => ({ ...account })), close };
  } catch (error) {
    await close();
    throw error;
  }
}
