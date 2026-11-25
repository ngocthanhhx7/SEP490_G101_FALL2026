import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { COUNCIL_ORIGIN, createCouncilDemo } from './runtime.js';

const frontendDirectory = fileURLToPath(new URL('../../../frontend/dist/', import.meta.url));
const { port } = new URL(COUNCIL_ORIGIN);
let demo;
try {
  await access(new URL('../../../frontend/dist/index.html', import.meta.url));
  demo = await createCouncilDemo({ frontendDirectory });
  const server = demo.app.listen(Number(port), '127.0.0.1');
  await once(server, 'listening');
  console.log(`Demo hội đồng: ${COUNCIL_ORIGIN}/sign-in`);
  console.table(demo.accounts);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await demo.close();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  await demo?.close();
  console.error(`Không khởi động được demo (${error.code ?? error.name}). Kiểm tra bản build frontend và cổng ${port}.`);
  process.exitCode = 1;
}
