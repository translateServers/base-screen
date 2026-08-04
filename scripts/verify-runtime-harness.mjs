import { createServer as createHttpServer } from 'node:http';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const host = await createServer({
  root: 'examples/runtime-harness',
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
});
const remote = createHttpServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(remoteDocument(request.url ?? '/'));
});

await new Promise((resolve) => remote.listen(4176, '127.0.0.1', resolve));
try {
  await host.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' });
    const ready = await page.evaluate(() => window.runtimeHarness.start('/ready.html'));
    if (
      !ready.result.ok ||
      ready.status !== 'ready' ||
      ready.sandboxed !== 'allow-scripts allow-same-origin' ||
      ready.referrerPolicy !== 'no-referrer'
    ) {
      throw new Error('RUNTIME_HARNESS_READY_FAILED');
    }
    await page.waitForFunction(() => window.runtimeHarness.events.length === 1);
    const event = await page.evaluate(() => window.runtimeHarness.events[0]);
    if (event?.name !== 'capability_check' || event.payload?.parentAccessBlocked !== true) {
      throw new Error('RUNTIME_HARNESS_CAPABILITY_BOUNDARY_FAILED');
    }
    const malformed = await page.evaluate(() => window.runtimeHarness.start('/before-ready.html'));
    if (
      malformed.result.ok ||
      malformed.result.diagnostics[0]?.code !== 'REMOTE_PLUGIN_PROTOCOL_INVALID'
    ) {
      throw new Error('RUNTIME_HARNESS_PROTOCOL_ORDER_FAILED');
    }
    const timeout = await page.evaluate(() =>
      window.runtimeHarness.start('/never-ready.html', 100),
    );
    if (timeout.result.ok || timeout.result.diagnostics[0]?.code !== 'REMOTE_PLUGIN_TIMEOUT') {
      throw new Error('RUNTIME_HARNESS_TIMEOUT_FAILED');
    }
    const resourceConformance = await page.evaluate(() =>
      window.runtimeHarness.runHostResourceConformance(),
    );
    if (
      JSON.stringify(resourceConformance.scenarios) !==
      JSON.stringify([
        'success',
        'reject',
        'throw',
        'malformed',
        'never-settling',
        'replace',
        'remove',
        'clear',
        'dispose',
      ])
    ) {
      throw new Error(
        `RUNTIME_HARNESS_RESOURCE_CONFORMANCE_FAILED: ${JSON.stringify(resourceConformance)}`,
      );
    }
    const blueprintDiagnostics = await page.evaluate(() =>
      window.runtimeHarness.runBlueprintPortRejection(),
    );
    if (blueprintDiagnostics !== 1) {
      throw new Error('RUNTIME_HARNESS_BLUEPRINT_PORT_REJECTION_FAILED');
    }
    if (!(await page.evaluate(() => window.runtimeHarness.runContributionAuthority()))) {
      throw new Error('RUNTIME_HARNESS_CONTRIBUTION_AUTHORITY_FAILED');
    }
  } finally {
    await browser.close();
  }
} finally {
  await host.close();
  await new Promise((resolve, reject) =>
    remote.close((error) => (error ? reject(error) : resolve())),
  );
}

function remoteDocument(pathname) {
  const message =
    pathname === '/before-ready.html'
      ? "parent.postMessage({ protocolVersion: 1, type: 'emit-event', name: 'early', payload: null }, event.origin);"
      : pathname === '/never-ready.html'
        ? ''
        : `let parentAccessBlocked = false;
           try { void parent.document; } catch { parentAccessBlocked = true; }
           parent.postMessage({ protocolVersion: 1, type: 'ready' }, event.origin);
           parent.postMessage({ protocolVersion: 1, type: 'emit-event', name: 'capability_check', payload: { parentAccessBlocked } }, event.origin);`;
  return `<!doctype html><script>
    addEventListener('message', (event) => {
      if (event.data?.protocolVersion === 1 && event.data?.type === 'base-screen-init') {
        ${message}
      }
    });
  </script>`;
}
