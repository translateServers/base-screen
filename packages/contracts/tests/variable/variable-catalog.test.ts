import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  MAX_HOST_VARIABLE_PAGE_ITEMS,
  parseScreenHostVariableDescriptor,
  parseScreenHostVariablePage,
  type ScreenHostVariableCatalogPort,
  type ScreenHostVariableRequest,
  type ScreenVariableRefreshOptions,
} from '../../src/index.js';

describe('host variable catalog contracts', () => {
  it('strictly parses detached summaries and preview descriptors', () => {
    const pageInput = {
      items: [
        {
          sourceId: 'tenant-id',
          sourceType: 'data-source',
          name: 'tenantId',
          description: '当前租户',
        },
      ],
      nextCursor: 'opaque-next-page',
    };
    const page = parseScreenHostVariablePage(pageInput);
    expect(page).toMatchObject({ ok: true });
    if (page.ok) {
      expect(page.value).toEqual(pageInput);
      expect(page.value).not.toBe(pageInput);
      expect(page.value.items[0]).not.toBe(pageInput.items[0]);
    }
    expect(
      parseScreenHostVariableDescriptor({
        sourceId: 'tenant-id',
        sourceType: 'data-source',
        name: 'tenantId',
        description: null,
        previewable: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it('rejects unknown fields, duplicate ids, invalid names/cursors, and oversized pages', () => {
    const cases = [
      {
        items: [
          { sourceId: 'same', sourceType: 'data-source', name: 'first', description: null },
          { sourceId: 'same', sourceType: 'data-source', name: 'second', description: null },
        ],
      },
      {
        items: [{ sourceId: 'id', sourceType: 'data-source', name: '1bad', description: null }],
      },
      { items: [], nextCursor: '' },
      { items: [], nextCursor: 'bad\nvalue' },
      {
        items: Array.from({ length: MAX_HOST_VARIABLE_PAGE_ITEMS + 1 }, (_, index) => ({
          sourceId: `id-${index}`,
          sourceType: 'data-source',
          name: `name${index}`,
          description: null,
        })),
      },
      { items: [], token: 'secret' },
    ];
    for (const input of cases) {
      expect(parseScreenHostVariablePage(input)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' }],
      });
    }
    expect(
      parseScreenHostVariableDescriptor({
        sourceId: 'id',
        sourceType: 'data-source',
        name: 'name',
        description: null,
        previewable: true,
        value: 'secret',
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' }],
    });
  });

  it('exposes abort-aware ports, resolve purpose, and refresh options', () => {
    expectTypeOf<ScreenHostVariableCatalogPort['list']>().parameters.toMatchTypeOf<
      [
        {
          readonly query: string;
          readonly sourceType: 'data-source' | 'url-query';
          readonly limit: number;
          readonly signal: { readonly aborted: boolean };
        },
      ]
    >();
    expectTypeOf<ScreenHostVariableRequest>().toMatchTypeOf<{
      readonly variableId: string;
      readonly sourceId: string;
      readonly sourceType: 'data-source' | 'url-query';
      readonly controlled: boolean;
      readonly purpose: 'runtime' | 'authoring-preview';
    }>();
    expectTypeOf<ScreenVariableRefreshOptions>().toMatchTypeOf<{
      readonly variableIds?: readonly string[];
      readonly traceId?: string;
    }>();
  });
});
