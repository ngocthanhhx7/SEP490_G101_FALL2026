import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { sitterPublicProfileModels } from '../../src/models/sitter-public-profile.model.js';

if (!process.argv.includes('--apply')) console.log('DRY_RUN: create public profile collections and indexes; no records or policy changes');
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production') throw new Error('Production provisioning is outside this command scope');
    connection = await connectDatabase(config);
    for (const model of Object.values(sitterPublicProfileModels(connection))) {
      await model.createCollection(); await model.createIndexes();
    }
    console.log('PROFILE_STORAGE_PROVISIONED');
  } catch { console.error('Profile provisioning failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
