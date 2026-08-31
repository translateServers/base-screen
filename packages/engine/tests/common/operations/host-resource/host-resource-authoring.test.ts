import { describe, expect, it, vi } from 'vitest';
import {
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  parseBaseScreenHostResourceAuthoringIntent,
  parseBaseScreenHostResourceDragData,
  writeBaseScreenHostResourceDragData,
} from '../../../../src/common/operations/host-resource/host-resource-authoring.js';

const intent = {
  materialType: 'base.image',
  dataSource: {
    type: 'host-resource' as const,
    resourceType: 'xj_asset',
    resourceId: 'asset-12',
    params: {},
    binding: null,
  },
  name: '封面图',
};

describe('host resource authoring intent', () => {
  it('parses only the strict canonical shape', () => {
    expect(parseBaseScreenHostResourceAuthoringIntent(intent)).toEqual({
      ok: true,
      value: intent,
      diagnostics: [],
    });
    expect(
      parseBaseScreenHostResourceAuthoringIntent({ ...intent, signedUrl: 'https://example.test' }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }] });
    expect(
      parseBaseScreenHostResourceAuthoringIntent({
        ...intent,
        dataSource: { ...intent.dataSource, resourceId: 'https://example.test/signed' },
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }] });
    expect(
      parseBaseScreenHostResourceAuthoringIntent({
        ...intent,
        dataSource: {
          ...intent.dataSource,
          params: { authToken: { kind: 'literal', value: 'secret' } },
        },
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }] });
  });

  it('rejects malformed and over-limit drag payloads before JSON projection', () => {
    expect(parseBaseScreenHostResourceDragData(null as unknown as string)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }],
    });
    expect(parseBaseScreenHostResourceDragData('{')).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }],
    });
    expect(parseBaseScreenHostResourceDragData('x'.repeat(8 * 1024 + 1))).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_LIMIT_EXCEEDED' }],
    });
    expect(
      parseBaseScreenHostResourceAuthoringIntent({
        ...intent,
        dataSource: {
          ...intent.dataSource,
          params: { note: { kind: 'literal', value: '字'.repeat(3000) } },
        },
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_LIMIT_EXCEEDED' }] });
  });

  it('rejects non-JSON inputs without invoking accessors or toJSON', () => {
    const getter = vi.fn(() => 'unsafe');
    const toJSON = vi.fn(() => intent);
    const withGetter = { ...intent };
    Object.defineProperty(withGetter, 'name', { enumerable: true, get: getter });
    const cyclic: Record<string, unknown> = { ...intent };
    cyclic.name = cyclic;
    for (const input of [
      withGetter,
      { ...intent, toJSON },
      { ...intent, name: undefined },
      { ...intent, [Symbol('extra')]: true },
      { ...intent, dataSource: { ...intent.dataSource, params: { value: NaN } } },
      cyclic,
    ]) {
      expect(parseBaseScreenHostResourceAuthoringIntent(input)).toMatchObject({ ok: false });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('does not allow transport URLs in names or nested source values', () => {
    for (const url of [
      '//signed.example/image',
      'file:///private/image',
      'ftp://private/image',
      '/signed/7?token=secret',
      './signed/image',
      '../signed/image',
    ]) {
      expect(parseBaseScreenHostResourceAuthoringIntent({ ...intent, name: url })).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }],
      });
    }
  });

  it('writes the canonical payload under the public MIME type', () => {
    const setData = vi.fn();
    const transfer = { setData, effectAllowed: 'none' };
    expect(writeBaseScreenHostResourceDragData(transfer, intent)).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
    expect(setData).toHaveBeenCalledWith(
      BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
      JSON.stringify(intent),
    );
    expect(transfer.effectAllowed).toBe('copy');
  });
});
