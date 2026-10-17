import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const DEFAULT_HOST = '127.0.0.1';

export async function withAsyncResource(acquire, release, operation) {
  const resource = await acquire();
  try {
    return await operation(resource);
  } finally {
    await release(resource);
  }
}

export async function withChromiumBrowser(operation, launchOptions = undefined) {
  return withAsyncResource(
    () => chromium.launch(launchOptions),
    (browser) => browser.close(),
    operation,
  );
}

export async function withViteServer(config, operation) {
  const host = config.server?.host ?? DEFAULT_HOST;
  const port = config.server?.port;
  if (typeof host !== 'string' || typeof port !== 'number') {
    throw new Error('BROWSER_VERIFICATION_SERVER_ADDRESS_INVALID');
  }

  const server = await createServer({
    ...config,
    server: {
      host,
      strictPort: true,
      ...config.server,
    },
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }

  return withAsyncResource(
    async () => server,
    (runningServer) => runningServer.close(),
    (runningServer) =>
      operation({
        baseUrl: `http://${host}:${port}`,
        server: runningServer,
      }),
  );
}

export async function withViteBrowser(config, operation, launchOptions = undefined) {
  return withViteServer(config, ({ baseUrl, server }) =>
    withChromiumBrowser((browser) => operation({ baseUrl, browser, server }), launchOptions),
  );
}
