import { createServer } from 'node:http';
import { loadConfig } from './config/environment.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { startEarningAccrualWorker } from './jobs/earning-accrual.job.js';
import { startEmployeeDispatchWorker } from './jobs/employee-dispatch.job.js';

export async function startRuntime({ env = process.env, logger = () => {}, ...appOptions } = {}) {
  const config = loadConfig(env);
  const connection = await connectDatabase(config);
  const lifecycle = { draining: false };
  let server, accrualWorker, dispatchWorker;
  try {
    const app = createApp({ ...appOptions, config, connection, lifecycle, logger, env });
    server = createServer(app);
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });
    if (app.locals.financeSources) accrualWorker = startEarningAccrualWorker({ service: app.locals.financeSources, logger });
    if (app.locals.employeeDispatch) dispatchWorker = startEmployeeDispatchWorker({ service: app.locals.employeeDispatch, logger });
  } catch {
    await connection.close();
    throw new Error('HTTP server failed to start');
  }
  let stopping;
  function stop() {
    if (stopping) return stopping;
    lifecycle.draining = true;
    stopping = (async () => {
      let forced = false;
      const timer = setTimeout(() => { forced = true; server.closeAllConnections(); }, config.shutdownTimeoutMs);
      try { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
      finally { clearTimeout(timer); await dispatchWorker?.stop(); await accrualWorker?.stop(); await connection.close(); }
      logger({ event: 'shutdown_complete', forced });
    })();
    return stopping;
  }
  return { server, connection, lifecycle, config, stop };
}
