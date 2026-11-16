'use strict';

// One entry per `npx inertia-nestjs <framework>` subcommand: which template
// folder to copy, which packages to install, and the SSR entry the build
// scripts point at. Everything else (the Nest side, views/app.hbs, the patches)
// is the same for every framework.
const FRAMEWORKS = {
  react: {
    template: 'react',
    dependencies: ['@inertiajs/react', '@inertiajs/vite', 'react', 'react-dom'],
    devDependencies: ['vite', '@vitejs/plugin-react', '@types/react', '@types/react-dom'],
    ssrEntry: 'resources/js/ssr.tsx',
  },
  vue: {
    template: 'vue',
    dependencies: ['@inertiajs/vue3', '@inertiajs/vite', 'vue'],
    devDependencies: ['vite', '@vitejs/plugin-vue', 'vue-tsc'],
    ssrEntry: 'resources/js/ssr.ts',
  },
};

module.exports = { FRAMEWORKS };
