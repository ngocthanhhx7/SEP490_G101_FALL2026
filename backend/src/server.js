import { startRuntime } from './runtime.js';

const logger = event => console.log(JSON.stringify(event));
try {
  const runtime = await startRuntime({ logger });
  logger({ event: 'server_listening', port: runtime.server.address().port });
  const shutdown = () => runtime.stop().catch(() => {
    logger({ event: 'shutdown_failed' });
    process.exitCode = 1;
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (err) {
  const code = err.name === 'ConfigurationError' ? 'INVALID_CONFIGURATION' : err.name === 'DatabaseStartupError' ? err.code : 'STARTUP_UNAVAILABLE';
  logger({ event: 'startup_failed', code, ...(err.name === 'ConfigurationError' ? { fields: err.fields } : {}) });
  process.exitCode = 1;
}
