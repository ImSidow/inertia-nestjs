import '../css/app.css';
import type { DefineComponent } from 'vue';
import { createInertiaApp } from '@inertiajs/vue3';

const appName = 'Inertia App';
const pages = import.meta.glob<{ default: DefineComponent }>('./pages/**/*.vue');

// No setup(): the default mounts with createSSRApp (hydrating the server HTML)
// when the page was server-rendered, and createApp otherwise.
void createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),

  resolve: async (name) => {
    const page = pages[`./pages/${name}.vue`];

    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }

    return (await page()).default;
  },

  progress: {
    color: '#4B5563',
  },
});
