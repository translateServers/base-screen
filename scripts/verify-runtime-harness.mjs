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
    const failureMatrix = await page.evaluate(() =>
      window.runtimeHarness.runSandboxFailureMatrix(),
    );
    assertR1FailureMatrix(failureMatrix);
  } finally {
    await browser.close();
  }
} finally {
  await host.close();
  await new Promise((resolve, reject) =>
    remote.close((error) => (error ? reject(error) : resolve())),
  );
}

function assertR1FailureMatrix(matrix) {
  const expect = (condition, label) => {
    if (!condition) {
      throw new Error(`RUNTIME_HARNESS_R1_FAILURE_${label}: ${JSON.stringify(matrix)}`);
    }
  };
  expect(matrix.sameOrigin?.code === 'REMOTE_PLUGIN_ORIGIN_INVALID', 'SAME_ORIGIN');
  expect(matrix.sameOrigin?.element === undefined, 'SAME_ORIGIN_NO_IFRAME');
  expect(matrix.sameOrigin?.message === 'Remote plugin origin is invalid.', 'SAME_ORIGIN_MESSAGE');
  expect(matrix.invalidUrl?.code === 'REMOTE_PLUGIN_ORIGIN_INVALID', 'INVALID_URL');
  expect(matrix.invalidUrl?.element === undefined, 'INVALID_URL_NO_IFRAME');
  expect(matrix.invalidUrl?.message === 'Remote plugin origin is invalid.', 'INVALID_URL_MESSAGE');
  expect(matrix.mismatchedOrigin?.code === 'REMOTE_PLUGIN_ORIGIN_INVALID', 'MISMATCHED_ORIGIN');
  expect(matrix.mismatchedOrigin?.element === undefined, 'MISMATCHED_ORIGIN_NO_IFRAME');
  expect(
    matrix.mismatchedOrigin?.message === 'Remote plugin origin is invalid.',
    'MISMATCHED_ORIGIN_MESSAGE',
  );
  expect(matrix.malformed?.code === 'REMOTE_PLUGIN_PROTOCOL_INVALID', 'MALFORMED');
  expect(matrix.malformed?.status === 'failed', 'MALFORMED_STATUS');
  expect(
    matrix.malformed?.message === 'Remote plugin protocol message is invalid.',
    'MALFORMED_MESSAGE',
  );
  expect(matrix.repeatedReady?.ok === false, 'REPEATED_READY_FAILURE');
  expect(matrix.repeatedReady?.status === 'failed', 'REPEATED_READY_STATUS');
  expect(matrix.loadError?.code === 'REMOTE_PLUGIN_PROTOCOL_INVALID', 'LOAD_ERROR');
  expect(matrix.loadError?.status === 'failed', 'LOAD_ERROR_STATUS');
  expect(matrix.loadError?.message === 'Remote plugin could not load.', 'LOAD_ERROR_MESSAGE');
  expect(matrix.dispose?.code === 'REMOTE_PLUGIN_DISPOSED', 'DISPOSE');
  expect(matrix.dispose?.status === 'disposed', 'DISPOSE_STATUS');
  expect(matrix.dispose?.message === 'Remote plugin sandbox was disposed.', 'DISPOSE_MESSAGE');
  expect(
    JSON.stringify(matrix.remoteCapabilityProbe?.initKeys) ===
      JSON.stringify(['protocolVersion', 'type']),
    'CAPABILITY_INIT_SHAPE',
  );
  expect(matrix.remoteCapabilityProbe?.material === true, 'MATERIAL_NO_ACCESS');
  expect(matrix.remoteCapabilityProbe?.catalog === true, 'CATALOG_NO_ACCESS');
  expect(matrix.remoteCapabilityProbe?.document === true, 'DOCUMENT_NO_ACCESS');
  expect(matrix.remoteCapabilityProbe?.commandPort === true, 'COMMAND_PORT_NO_ACCESS');
  expect(matrix.remoteCapabilityProbe?.resource === true, 'RESOURCE_NO_ACCESS');
  expect(matrix.remoteCapabilityProbe?.credential === true, 'CREDENTIAL_NO_ACCESS');
}

function remoteDocument(pathname) {
  let message;
  switch (pathname) {
    case '/before-ready.html':
      message =
        "parent.postMessage({ protocolVersion: 1, type: 'emit-event', name: 'early', payload: null }, event.origin);";
      break;
    case '/never-ready.html':
      message = '';
      break;
    case '/malformed.html':
      message =
        "parent.postMessage({ protocolVersion: 1, type: 'unknown-type', name: 'x', payload: { url: 'http://127.0.0.1:4177/canary', error: 'Error: canary\\n    at remote', credential: 'canary credential' } }, event.origin);";
      break;
    case '/repeat-ready.html':
      message =
        "parent.postMessage({ protocolVersion: 1, type: 'ready' }, event.origin);\n" +
        "parent.postMessage({ protocolVersion: 1, type: 'ready' }, event.origin);";
      break;
    case '/capability-probe.html':
      message = `const inaccessible = (name) => {
            try { return parent[name] === undefined; } catch { return true; }
          };
          parent.postMessage({ protocolVersion: 1, type: 'ready' }, event.origin);
          parent.postMessage({
            protocolVersion: 1,
            type: 'emit-event',
            name: 'capability_probe',
            payload: {
              initKeys: Object.keys(event.data).sort(),
              material: inaccessible('baseScreenMaterial'),
              catalog: inaccessible('baseScreenCatalog'),
              document: inaccessible('baseScreenDocument'),
              commandPort: inaccessible('baseScreenCommandPort'),
              resource: inaccessible('baseScreenResource'),
              credential: inaccessible('baseScreenCredential'),
            },
          }, event.origin);`;
      break;
    default:
      message = `let parentAccessBlocked = false;
           try { void parent.document; } catch { parentAccessBlocked = true; }
           parent.postMessage({ protocolVersion: 1, type: 'ready' }, event.origin);
           parent.postMessage({ protocolVersion: 1, type: 'emit-event', name: 'capability_check', payload: { parentAccessBlocked } }, event.origin);`;
  }
  return `<!doctype html><script>
    addEventListener('message', (event) => {
      if (event.data?.protocolVersion === 1 && event.data?.type === 'base-screen-init') {
        ${message}
      }
    });
  </script>`;
}
