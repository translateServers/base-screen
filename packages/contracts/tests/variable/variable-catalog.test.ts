import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  MAX_HOST_CATALOG_PAGE_ITEMS,
  parseScreenHostCatalogDescriptor,
  parseScreenHostCatalogPage,
  type ScreenHostCatalogPort,
  type ScreenHostCatalogResolveRequest,
  type ScreenVariableRefreshOptions,
} from '../../src/index.js';

describe('host catalog contracts', () => {
  it('strictly parses detached summaries and preview descriptors', () => {
    const pageInput = {
      items: [
        {
          sourceId: 'tenant-id',
          name: 'tenantId',
          description: '当前租户',
        },
      ],
      nextCursor: 'opaque-next-page',
    };
    const page = parseScreenHostCatalogPage(pageInput);
    expect(page).toMatchObject({ ok: true });
    if (page.ok) {
      expect(page.value).toEqual(pageInput);
      expect(page.value).not.toBe(pageInput);
      expect(page.value.items[0]).not.toBe(pageInput.items[0]);
    }
    expect(
      parseScreenHostCatalogDescriptor({
        sourceId: 'tenant-id',
        name: 'tenantId',
        description: null,
        parameters: [],
        previewable: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it('parses catalog parameters with the dataset parameter definition shape', () => {
    const descriptor = parseScreenHostCatalogDescriptor({
      sourceId: 'tenant-id',
      name: 'tenantId',
      description: null,
      parameters: [
        {
          name: 'region',
          label: '区域',
          valueType: 'string',
          required: true,
          defaultValue: 'cn',
          allowedValues: ['cn', 'us'],
        },
      ],
      readOnly: true,
      previewable: false,
    });
    expect(descriptor).toMatchObject({
      ok: true,
      value: {
        readOnly: true,
        parameters: [{ name: 'region', required: true, defaultValue: 'cn' }],
      },
    });
    expect(
      parseScreenHostCatalogDescriptor({
        sourceId: 'tenant-id',
        name: 'tenantId',
        description: null,
        parameters: [{ name: 'region', label: '区域', valueType: 'grid', required: true }],
        previewable: true,
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' }],
    });
  });

  it('rejects unknown fields, duplicate ids, invalid names/cursors, and oversized pages', () => {
    const cases = [
      {
        items: [
          { sourceId: 'same', name: 'first', description: null },
          { sourceId: 'same', name: 'second', description: null },
        ],
      },
      {
        items: [{ sourceId: 'id', name: '1bad', description: null }],
      },
      { items: [], nextCursor: '' },
      { items: [], nextCursor: 'bad\nvalue' },
      {
        items: Array.from({ length: MAX_HOST_CATALOG_PAGE_ITEMS + 1 }, (_, index) => ({
          sourceId: `id-${index}`,
          name: `name${index}`,
          description: null,
        })),
      },
      { items: [], token: 'secret' },
    ];
    for (const input of cases) {
      expect(parseScreenHostCatalogPage(input)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' }],
      });
    }
    expect(
      parseScreenHostCatalogDescriptor({
        sourceId: 'id',
        name: 'name',
        description: null,
        parameters: [],
        previewable: true,
        value: 'secret',
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' }],
    });
  });

  it('exposes abort-aware ports, resolve purpose, and refresh options', () => {
    expectTypeOf<ScreenHostCatalogPort['list']>().parameters.toMatchTypeOf<
      [
        {
          readonly query: string;
          readonly limit: number;
          readonly signal: { readonly aborted: boolean };
        },
      ]
    >();
    expectTypeOf<ScreenHostCatalogResolveRequest>().toMatchTypeOf<{
      readonly sourceId: string;
      readonly params: Readonly<Record<string, unknown>>;
      readonly purpose: 'runtime' | 'authoring-preview';
    }>();
    expectTypeOf<ScreenVariableRefreshOptions>().toMatchTypeOf<{
      readonly variableIds?: readonly string[];
      readonly traceId?: string;
    }>();
  });
});
