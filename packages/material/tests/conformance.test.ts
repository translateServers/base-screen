import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BaseScreenChartMaterialElement,
  BaseScreenTableMaterialElement,
} from '../src/index.js';

/**
 * 官方/第三方物料 conformance（DRH-R7）：物料 SHALL 安全处理
 * idle/loading/empty/ready/error 全部数据状态，不抛异常、不把空数据当错误。
 */

type StubElement = {
  model: BaseScreenMaterialModel;
  dataset: Record<string, string>;
  ariaBusy: string;
  replaceChildren: () => void;
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  isConnected: boolean;
  ownerDocument: {
    createElement: () => unknown;
    createElementNS: () => unknown;
  };
  appendChild: (node: unknown) => void;
};

function elementWith(
  Element: new () => BaseScreenMaterialElement,
  state: BaseScreenMaterialModel,
): { element: StubElement; threw: boolean } {
  const element = new Element() as unknown as StubElement;
  element.dataset = {};
  element.ariaBusy = '';
  element.replaceChildren = () => {};
  element.style = {};
  element.setAttribute = () => {};
  element.isConnected = true;
  element.appendChild = () => {};
  element.ownerDocument = {
    // 共享状态视图会 setAttribute 并给 loading 视图挂 shadow root，桩要能承接。
    createElement: () => ({
      style: {},
      textContent: '',
      setAttribute: () => {},
      attachShadow: () => ({ append: () => {} }),
    }),
    createElementNS: () => ({
      style: {},
      setAttribute: () => {},
      addEventListener: () => {},
      appendChild: () => {},
    }),
  };
  try {
    element.model = state;
    return { element, threw: false };
  } catch {
    return { element, threw: true };
  }
}

function model(
  status: BaseScreenMaterialModel['dataState']['status'],
  style: BaseScreenMaterialModel['style'] = {},
): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style,
    size: { width: 100, height: 100 },
    dataState:
      status === 'ready'
        ? { status: 'ready', value: { series: [{ id: 's', label: 'S', points: [] }] } }
        : status === 'error'
          ? {
              status: 'error',
              code: 'HOST_RESOURCE_FAILED',
              message: 'Host resource request failed.',
            }
          : { status },
  };
}

describe('official material conformance (DRH-R7)', () => {
  it('table material safely handles idle, loading, empty, ready, and error states', () => {
    for (const status of ['idle', 'loading', 'ready', 'error'] as const) {
      const { element, threw } = elementWith(BaseScreenTableMaterialElement, model(status));
      expect(threw).toBe(false);
      expect(element.dataset.baseScreenDataState).toBe(status);
    }
  });

  it('chart material safely handles idle, loading, ready, and error states', () => {
    for (const status of ['idle', 'loading', 'ready', 'error'] as const) {
      const { element, threw } = elementWith(BaseScreenChartMaterialElement, model(status));
      expect(threw).toBe(false);
      expect(element.dataset.baseScreenDataState).toBe(status);
    }
  });

  it('table adapter projects a zero-row dataset as ready empty data, not an error', () => {
    const result = BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER.adapt({
      dataset: {
        fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
        rows: [],
      },
      fields: { columns: [{ id: 'amount', label: '金额', valueType: 'number' }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ rows: [], columns: [{ id: 'amount' }] });
    }
  });

  it('chart adapter rejects a missing dimension with a safe failure, never an exception', () => {
    const result = BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER.adapt({
      dataset: { fields: [], rows: [] },
      fields: {},
    });
    expect(result.ok).toBe(false);
  });

  it('official tabular materials declare the independent dataset capability', () => {
    expect(BASE_SCREEN_TABLE_MATERIAL_MANIFEST.dataCapabilities).toContain('dataset');
    expect(BASE_SCREEN_CHART_MATERIAL_MANIFEST.dataCapabilities).toContain('dataset');
    expect(BASE_SCREEN_TABLE_MATERIAL_MANIFEST.dataCapabilities).not.toContain('host-resource');
    expect(BASE_SCREEN_CHART_MATERIAL_MANIFEST.dataCapabilities).not.toContain('host-resource');
  });

  it('only the image material opts into host resource selection', () => {
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.hostResourceSelection).toBe(true);
    expect(BASE_SCREEN_TABLE_MATERIAL_MANIFEST.hostResourceSelection).not.toBe(true);
    expect(BASE_SCREEN_CHART_MATERIAL_MANIFEST.hostResourceSelection).not.toBe(true);
  });

  it('renders declared gradient background fields while keeping unsupported colors solid-only', () => {
    const gradient = 'linear-gradient(90deg, #112233 0%, #ffffff 100%)';
    for (const Element of [BaseScreenChartMaterialElement, BaseScreenTableMaterialElement]) {
      const { element, threw } = elementWith(Element, model('idle', { backgroundColor: gradient }));
      expect(threw).toBe(false);
      expect(element.style.backgroundImage).toBe(gradient);
      expect(element.style.backgroundColor).toBe('transparent');
    }

    expect(
      BASE_SCREEN_CHART_MATERIAL_MANIFEST.stylePanel.find(
        (field) => field.style === 'backgroundColor',
      )?.allowGradient,
    ).toBe(true);
    expect(
      BASE_SCREEN_CHART_MATERIAL_MANIFEST.stylePanel.find((field) => field.style === 'gridColor')
        ?.allowGradient,
    ).toBeUndefined();
  });
});
