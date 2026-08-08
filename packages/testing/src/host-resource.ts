import type {
  ScreenAbortSignal,
  ScreenComponentDataSource,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';

export type HostResourceDataState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: ScreenJsonValue }
  | { readonly status: 'error'; readonly code: string; readonly message: string };

export interface HostResourceConformanceRenderer {
  render(document: ScreenDocument): ScreenParseResult<null>;
  clear(): void;
  dispose(): void;
}

export interface HostResourceConformanceHarness {
  readonly createRenderer: (
    resourcePort: ScreenHostResourcePort,
  ) => HostResourceConformanceRenderer;
  readonly createDocument: (dataSource: ScreenComponentDataSource | null) => ScreenDocument;
  readonly readDataState: () => HostResourceDataState | undefined;
  readonly flush: () => Promise<void>;
  readonly waitForTimeout: () => Promise<void>;
}

export interface HostResourceConformanceResult {
  readonly scenarios: readonly string[];
}

export async function runHostResourceConformance(
  harness: HostResourceConformanceHarness,
): Promise<HostResourceConformanceResult> {
  const scenarios: string[] = [];
  await assertSuccess(harness);
  scenarios.push('success');
  await assertFailure(harness, 'reject');
  scenarios.push('reject');
  await assertFailure(harness, 'throw');
  scenarios.push('throw');
  await assertMalformed(harness);
  scenarios.push('malformed');
  await assertNeverSettling(harness);
  scenarios.push('never-settling');
  await assertCancellation(harness, 'replace');
  scenarios.push('replace');
  await assertCancellation(harness, 'remove');
  scenarios.push('remove');
  await assertCancellation(harness, 'clear');
  scenarios.push('clear');
  await assertCancellation(harness, 'dispose');
  scenarios.push('dispose');
  return { scenarios };
}

function createHostResourceSource(): ScreenComponentDataSource {
  return {
    type: 'host-resource',
    resourceType: 'test_resource',
    resourceId: 'test_request',
    params: {},
    binding: null,
  };
}

async function assertSuccess(harness: HostResourceConformanceHarness): Promise<void> {
  const pending = createPendingPort();
  const renderer = harness.createRenderer(pending.port);
  renderer.render(harness.createDocument(createHostResourceSource()));
  pending.resolve({ ok: true, value: { value: 'ready' }, diagnostics: [] });
  await harness.flush();
  assertState(harness, 'ready');
  renderer.dispose();
}

async function assertFailure(
  harness: HostResourceConformanceHarness,
  mode: 'reject' | 'throw',
): Promise<void> {
  const port: ScreenHostResourcePort = {
    resolve: async () => {
      if (mode === 'throw') {
        throw new Error('test failure');
      }
      return { ok: false, diagnostics: [] };
    },
  };
  const renderer = harness.createRenderer(port);
  renderer.render(harness.createDocument(createHostResourceSource()));
  await harness.flush();
  assertState(harness, 'error', 'HOST_RESOURCE_FAILED');
  renderer.dispose();
}

async function assertMalformed(harness: HostResourceConformanceHarness): Promise<void> {
  const port: ScreenHostResourcePort = {
    resolve: async () => ({
      ok: true,
      value: Number.NaN as unknown as ScreenJsonValue,
      diagnostics: [],
    }),
  };
  const renderer = harness.createRenderer(port);
  renderer.render(harness.createDocument(createHostResourceSource()));
  await harness.flush();
  assertState(harness, 'error', 'HOST_RESOURCE_INVALID');
  renderer.dispose();
}

async function assertNeverSettling(harness: HostResourceConformanceHarness): Promise<void> {
  const pending = createPendingPort();
  const renderer = harness.createRenderer(pending.port);
  renderer.render(harness.createDocument(createHostResourceSource()));
  await harness.waitForTimeout();
  assertAbort(pending, 'never-settling');
  assertState(harness, 'error', 'HOST_RESOURCE_TIMEOUT');
  renderer.dispose();
}

async function assertCancellation(
  harness: HostResourceConformanceHarness,
  mode: 'replace' | 'remove' | 'clear' | 'dispose',
): Promise<void> {
  const pending = createPendingPort();
  const renderer = harness.createRenderer(pending.port);
  renderer.render(harness.createDocument(createHostResourceSource()));
  if (mode === 'replace') {
    renderer.render(harness.createDocument({ type: 'static', value: null }));
  } else if (mode === 'remove') {
    const document = harness.createDocument(createHostResourceSource());
    renderer.render({ ...document, components: [] });
  } else if (mode === 'clear') {
    renderer.clear();
  } else {
    renderer.dispose();
  }
  pending.resolve({ ok: true, value: { late: true }, diagnostics: [] });
  await harness.flush();
  assertAbort(pending, mode);
  if (mode === 'replace') {
    assertState(harness, 'ready');
  } else if (harness.readDataState() !== undefined) {
    throw new Error(`Host resource ${mode} cancellation left a mounted material.`);
  }
  renderer.dispose();
}

function createPendingPort(): {
  readonly port: ScreenHostResourcePort;
  readonly resolve: (result: ScreenParseResult<ScreenJsonValue>) => void;
  readonly signal: () => ScreenAbortSignal | undefined;
} {
  let resolve: ((result: ScreenParseResult<ScreenJsonValue>) => void) | undefined;
  let signal: ScreenAbortSignal | undefined;
  return {
    port: {
      resolve: (_request, options) => {
        signal = options.signal;
        return new Promise<ScreenParseResult<ScreenJsonValue>>((complete) => {
          resolve = complete;
        });
      },
    },
    resolve: (result) => resolve?.(result),
    signal: () => signal,
  };
}

function assertAbort(
  pending: { readonly signal: () => ScreenAbortSignal | undefined },
  scenario: string,
): void {
  if (pending.signal()?.aborted !== true) {
    throw new Error(`Host resource ${scenario} did not abort its signal.`);
  }
}

function assertState(
  harness: HostResourceConformanceHarness,
  status: HostResourceDataState['status'],
  code?: string,
): void {
  const actual = harness.readDataState();
  if (
    actual?.status !== status ||
    (code !== undefined && actual.status === 'error' && actual.code !== code)
  ) {
    throw new Error(
      `Host resource state expected ${status}${code === undefined ? '' : `/${code}`}.`,
    );
  }
}
