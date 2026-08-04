import { describe, expect, it } from 'vitest';
import { createBaseScreenRemotePluginSandbox } from './remote-sandbox.js';

describe('RemotePluginSandbox preflight', () => {
  it('rejects same-origin input before creating an iframe', async () => {
    let iframeCreates = 0;
    const target = {
      ownerDocument: {
        location: { origin: 'https://host.example' },
        createElement: () => {
          iframeCreates++;
          return {};
        },
      },
    } as unknown as HTMLElement;

    const sandbox = createBaseScreenRemotePluginSandbox({
      target,
      entryUrl: 'https://host.example/remote.html',
      expectedOrigin: 'https://host.example',
      onEvent: undefined,
    });

    expect(sandbox.element).toBeUndefined();
    expect((await sandbox.ready()).ok).toBe(false);
    expect(iframeCreates).toBe(0);
  });
});
