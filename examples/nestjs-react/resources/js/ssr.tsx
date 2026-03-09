import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import ReactDOMServer from 'react-dom/server';

createServer((page) =>
  createInertiaApp({
    page,
    render: ReactDOMServer.renderToString,

    resolve: async (name) => {
      const pages = import.meta.glob('./pages/**/*.tsx');
      const pageModule = pages[`./pages/${name}.tsx`];

      if (!pageModule) {
        throw new Error(`SSR page not found: ${name}`);
      }

      const module = await pageModule();
      return (module as { default: React.ComponentType }).default;
    },

    setup: ({ App, props }) => <App {...props} />,
  }),
);
