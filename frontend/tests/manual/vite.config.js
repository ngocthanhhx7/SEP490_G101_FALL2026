import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Separate manual fixture: production router/root/manifest unchanged.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: '../../public', plugins: [react()],
  build: { outDir: '../../dist/p04-manual', emptyOutDir: true },
});
