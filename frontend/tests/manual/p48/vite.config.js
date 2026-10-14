import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

export default defineConfig({
  root,
  publicDir,
  plugins: [react()],
});
