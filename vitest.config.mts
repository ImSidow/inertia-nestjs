import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // Same alias the Jest moduleNameMapper provided: `src/...` → ./src/...
        alias: { src: fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
        globals: true,
        include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
        coverage: { include: ['src/**/*.ts'], reportsDirectory: 'coverage' },
    },
});
