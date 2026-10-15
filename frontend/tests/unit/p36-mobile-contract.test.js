import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relativePath) {
  return readFileSync(join(globalThis.process.cwd(), relativePath), 'utf8');
}

describe('P36 mobile and keyboard contract', () => {
  test('design tokens expose a 44px-equivalent target and visible focus ring', () => {
    const tokens = source('src/styles/tokens.css');
    expect(tokens).toMatch(/--pwc-target:\s*2\.75rem/);
    expect(tokens).toMatch(/--pwc-focus-width:\s*3px/);
    expect(source('src/styles/base.css')).toMatch(/:focus-visible/);
  });

  test('shared controls remain touch-sized and wrap safely', () => {
    const ui = source('src/components/ui/ui.css');
    expect(ui).toMatch(/min-height:\s*var\(--pwc-target\)/);
    expect(ui).toMatch(/overflow-wrap:\s*anywhere/);
    expect(ui).toMatch(/max-width:\s*100%/);
  });

  test('role navigation has a mobile breakpoint and keyboard focus target', () => {
    const layout = source('src/layouts/role-dashboard-layout.css');
    expect(layout).toMatch(/@media\s*\(max-width:\s*48rem\)/);
    expect(layout).toMatch(/\.pwc-role-shell__main:focus-visible/);
    expect(layout).toMatch(/data-open='true'/);
  });

  test('API client never persists private responses and keeps mutations single-shot', () => {
    const client = source('src/services/api-client.js');
    expect(client).toMatch(/cache:\s*'no-store'/);
    expect(client).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(client).toMatch(/redirect:\s*'error'/);
  });
});
