import { app } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { ensureModelIndexes } from './models/index.js';
import { ensureBaseRoles } from './models/role.js';
import { startPetSitterApplicationCleanup } from './services/pet-sitter-application-services.js';

await connectDatabase();
if (config.nodeEnv === 'development' || config.nodeEnv === 'test') {
  await ensureModelIndexes();
  await ensureBaseRoles();
}
const stopPetSitterCleanup = startPetSitterApplicationCleanup();

const server = app.listen(config.port, () => {
  console.info(`Backend listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.info(`${signal} received; closing backend`);
  server.close(async () => {
    stopPetSitterCleanup();
    await disconnectDatabase();
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
