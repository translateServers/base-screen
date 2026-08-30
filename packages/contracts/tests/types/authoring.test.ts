import { describe, expect, it } from 'vitest';
import { MAX_AUTHORING_CANDIDATE_BYTES, parseScreenAuthoringRequest } from '../../src/index.js';

describe('component text authoring request', () => {
  const request = {
    kind: 'component-text',
    requestId: 'authoring-text-1',
    componentId: 'chart-1',
    documentRevision: null,
    target: 'props',
    source: '{}',
    format: 'json',
    maxBytes: MAX_AUTHORING_CANDIDATE_BYTES,
  } as const;

  it('keeps the strict component text protocol', () => {
    expect(parseScreenAuthoringRequest(request).ok).toBe(true);
    expect(parseScreenAuthoringRequest({ ...request, unknown: true }).ok).toBe(false);
  });

  it('rejects the removed detached Blueprint request branch', () => {
    expect(
      parseScreenAuthoringRequest({
        kind: 'blueprint',
        requestId: 'authoring-blueprint-1',
        documentRevision: null,
        context: {},
      }),
    ).toMatchObject({ ok: false });
  });
});
