import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import inertia from '@inertiajs/vite';
import path from 'node:path';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [inertia(), vue()],
  base: '/build/',
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'resources/js'),
    },
  },
  build: isSsrBuild
    ? {
        ssr: 'resources/js/ssr.ts',
        outDir: 'bootstrap/ssr',
        emptyOutDir: false,
        rollupOptions: {
          output: {
            entryFileNames: 'ssr.mjs',
          },
        },
      }
    : {
        outDir: 'public/build',
        emptyOutDir: true,
        rollupOptions: {
          input: 'resources/js/app.ts',
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
