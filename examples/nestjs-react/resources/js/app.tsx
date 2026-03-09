import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

void createInertiaApp({
  resolve: async (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx');
    const page = pages[`./pages/${name}.tsx`];

    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }

    const module = await page();
    return (module as { default: React.ComponentType }).default;
  },

  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },

  progress: {
    color: '#4B5563',
  },
});
