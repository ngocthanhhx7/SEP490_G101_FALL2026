import { readFile, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { createEmployeeOnboardingRepair, ONBOARDING_REPAIR } from '../../src/services/employee-onboarding-repair.service.js';
const config = loadConfig(), manifest = process.env.EMPLOYEE_ONBOARDING_MANIFEST;
if (!manifest) throw new Error('EMPLOYEE_ONBOARDING_MANIFEST_REQUIRED');
const connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false, autoIndex: false, maxPoolSize: 2 }).asPromise();
try {
  const repair = createEmployeeOnboardingRepair({ connection });
  if (process.argv.includes('--apply')) {
    if (process.env.CONFIRMED_EMPLOYEE_ONBOARDING !== ONBOARDING_REPAIR || process.env.CONFIRMED_EMPLOYEE_DATABASE !== config.database) throw new Error('EXACT_DATABASE_AND_OWNER_CONFIRMATION_REQUIRED');
    const plan = JSON.parse(await readFile(manifest, 'utf8'));
    const result = await repair.apply({ actorId: process.env.EMPLOYEE_ONBOARDING_ADMIN_ID, expectedDigest: plan.digest, confirmation: process.env.CONFIRMED_EMPLOYEE_ONBOARDING });
    await writeFile(manifest + '.applied.json', JSON.stringify({ at: new Date(), database: config.database, digest: plan.digest, result }), { mode: 0o600 });
    console.log(JSON.stringify({ state: 'EMPLOYEE_ONBOARDING_APPLIED', ...result }));
  } else {
    const plan = await repair.inspect(); await writeFile(manifest, JSON.stringify({ database: config.database, ...plan }), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: 'EMPLOYEE_ONBOARDING_DRY_RUN', database: config.database, employees: plan.users.length, existingContracts: plan.contracts.length,
      existingCapabilities: plan.profiles.length, services: plan.services.length, conflictingWork: false, digest: plan.digest, mutation: false }));
  }
} finally { await connection.close(); }
