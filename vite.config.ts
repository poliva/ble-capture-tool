import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ble-capture-tool/',
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['smartcube-web-bluetooth'],
  },
});
