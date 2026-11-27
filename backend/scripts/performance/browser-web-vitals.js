/* global __ENV, __ITER, performance */
import { browser } from 'k6/browser';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const frontendUrl = (__ENV.PERF_FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/$/u, '');
const pageLoadMs = new Trend('browser_page_load_ms', true);
const firstPaintMs = new Trend('browser_first_paint_ms', true);
const largestContentfulPaintMs = new Trend('browser_lcp_ms', true);
const pageErrors = new Rate('browser_page_errors');

export const options = {
  scenarios: {
    browser: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 1),
      duration: __ENV.DURATION || '30s',
      options: { browser: { type: 'chromium' } }
    }
  },
  thresholds: {
    browser_page_errors: ['rate<0.01'],
    browser_page_load_ms: ['p(95)<3000'],
    browser_lcp_ms: ['p(95)<2500']
  }
};

const pages = [
  { id: 'home', path: '/' },
  { id: 'services', path: '/services' },
  { id: 'products', path: '/products' },
  { id: 'sign-in', path: '/sign-in' },
  { id: 'service-areas', path: '/service-areas' }
];

export default async function browserPerformance() {
  const page = await browser.newPage();
  const target = pages[__ITER % pages.length];
  const started = Date.now();
  try {
    const response = await page.goto(`${frontendUrl}${target.path}`, { waitUntil: 'networkidle' });
    const vitals = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
      return {
        navigationMs: navigation?.duration ?? 0,
        firstPaintMs: paints.find(entry => entry.name === 'first-paint')?.startTime ?? 0,
        lcpMs: lcp?.startTime ?? 0
      };
    });
    pageLoadMs.add(Date.now() - started, { page: target.id });
    firstPaintMs.add(vitals.firstPaintMs, { page: target.id });
    largestContentfulPaintMs.add(vitals.lcpMs, { page: target.id });
    pageErrors.add(0, { page: target.id });
    check(response, { [`${target.id} returns a document`]: result => result?.status() < 400 });
  } catch (error) {
    pageErrors.add(1, { page: target.id });
    console.error(`${target.id} failed: ${error.message}`);
  } finally {
    await page.close();
  }
}
