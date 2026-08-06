import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import inertia from '@inertiajs/vite';
import path from 'node:path';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [inertia(), react()],
  base: '/build/',
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'resources/js'),
    },
  },
  build: isSsrBuild
    ? {
        ssr: 'resources/js/ssr.tsx',
        outDir: 'bootstrap/ssr',
        emptyOutDir: false,
        rollupOptions: {
          output: {
            entryFileNames: 'ssr.js',
          },
        },
      }
    : {
        outDir: 'public/build',
        emptyOutDir: true,
        rollupOptions: {
          input: 'resources/js/app.tsx',
          output: {
            entryFileNames: 'app.js',
            chunkFileNames: 'chunks/[name]-[hash].js',
            assetFileNames: (assetInfo) =>
              assetInfo.names?.some((name) => name.endsWith('.css'))
                ? 'app.css'
                : 'assets/[name]-[hash][extname]',
          },
        },
      },
}));
