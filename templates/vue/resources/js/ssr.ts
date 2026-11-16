import type { DefineComponent } from 'vue';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createInertiaApp } from '@inertiajs/vue3';
import createServer from '@inertiajs/vue3/server';

const appName = 'Inertia App';
const pages = import.meta.glob<{ default: DefineComponent }>('./pages/**/*.vue');

createServer((page) =>
  createInertiaApp({
    page,
    render: renderToString,
    title: (title) => (title ? `${title} - ${appName}` : appName),

    resolve: async (name) => {
      const pageModule = pages[`./pages/${name}.vue`];

      if (!pageModule) {
        throw new Error(`SSR page not found: ${name}`);
      }

      return (await pageModule()).default;
    },

    setup: ({ App, props, plugin }) => createSSRApp({ render: () => h(App, props) }).use(plugin),
  }),
);
