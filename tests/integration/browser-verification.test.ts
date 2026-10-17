import { describe, expect, it, vi } from 'vitest';
import { withAsyncResource } from '../../tooling/verification/browser-verification.mjs';

describe('browser verification resources', () => {
  it('releases the resource after a successful operation', async () => {
    const resource = { name: 'browser' };
    const release = vi.fn();

    await expect(
      withAsyncResource(
        async () => resource,
        release,
        async (value) => value.name,
      ),
    ).resolves.toBe('browser');
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(resource);
  });

  it('releases the resource when the operation fails', async () => {
    const resource = { name: 'server' };
    const release = vi.fn();
    const failure = new Error('verification failed');

    await expect(
      withAsyncResource(
        async () => resource,
        release,
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(resource);
  });
});
