import '../css/app.css';
import type { ComponentType } from 'react';
import { createInertiaApp } from '@inertiajs/react';

type PageModule = {
  default: ComponentType<Record<string, unknown>>;
};

const appName = 'Inertia App';
const pages = import.meta.glob<PageModule>('./pages/**/*.tsx');

void createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),

  resolve: async (name) => {
    const page = pages[`./pages/${name}.tsx`];

    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }

    const module = await page();
    return module.default;
  },

  strictMode: true,

  progress: {
    color: '#4B5563',
  },
});
