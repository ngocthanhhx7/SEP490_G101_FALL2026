import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

// shortcut: keep provider behavior in a standalone double until each runtime
// adapter receives an explicitly reviewed localhost injection point.
const port = Number(process.env.PERF_PROVIDER_PORT ?? 4310);
const delayMs = Math.max(0, Number(process.env.PERF_PROVIDER_DELAY_MS ?? 0));
const failure = process.env.PERF_PROVIDER_FAILURE ?? 'none';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function payosSignature(data) {
  const canonical = Object.keys(data).sort().map(key => `${key}=${data[key]}`).join('&');
  return createHmac('sha256', process.env.PERF_PROVIDER_CHECKSUM_KEY ?? 'synthetic-checksum-key')
    .update(canonical, 'utf8').digest('hex');
}

function payosBody(orderCode = 900001) {
  const data = {
    orderCode, amount: 100000, amountPaid: 0, amountRemaining: 100000,
    currency: 'VND', status: 'PENDING', paymentLinkId: 'synthetic-payment-link',
    checkoutUrl: 'https://pay.payos.vn/web/synthetic-payment-link'
  };
  return { code: '00', desc: 'success', data, signature: payosSignature(data) };
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { status: 'ok', mode: 'synthetic' });
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  if (failure === 'timeout') return;
  if (failure === '503') return json(res, 503, { code: 'SYNTHETIC_PROVIDER_UNAVAILABLE' });
  if (failure === '429') return json(res, 429, { code: 'SYNTHETIC_RATE_LIMITED' });

  if (req.url?.startsWith('/payos/v2/payment-requests')) {
    const orderCode = Number(req.url.split('/').pop()) || 900001;
    return json(res, 200, payosBody(orderCode));
  }
  if (req.url === '/email') return json(res, 202, { accepted: true, provider: 'synthetic-smtp' });
  if (req.url === '/sms') return json(res, 200, { CodeResult: '100', provider: 'synthetic-esms' });
  if (req.url === '/r2/upload') return json(res, 200, { uploaded: true, provider: 'synthetic-r2' });
  if (req.url === '/ai/recommendations') return json(res, 200, { recommendations: [], provider: 'synthetic-ai' });
  return json(res, 404, { code: 'SYNTHETIC_ROUTE_NOT_FOUND' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ state: 'READY', url: `http://127.0.0.1:${port}`, failure, delayMs }));
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
