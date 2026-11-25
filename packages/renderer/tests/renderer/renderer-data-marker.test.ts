import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { applyMaterialDataMarker } from '../../src/renderer/renderer-material-dom.js';

/**
 * ADR-0104 §2.6：过期标记由渲染器写到物料宿主元素上，任何物料（含不继承官方基类的
 * 插件物料）都会被标记，查看器的默认角标因此对所有组件生效。
 */
function fakeElement(): BaseScreenMaterialElement {
  return { dataset: {} as DOMStringMap, style: {} } as unknown as BaseScreenMaterialElement;
}

function model(dataState: BaseScreenMaterialModel['dataState']): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style: {},
    size: { width: 10, height: 10 },
    dataState,
  };
}

describe('applyMaterialDataMarker', () => {
  it('marks ready + stale and clears the mark once fresh or not ready', () => {
    const element = fakeElement();
    applyMaterialDataMarker(element, model({ status: 'ready', value: 1 }));
    expect(element.dataset.baseScreenDataStale).toBeUndefined();
    applyMaterialDataMarker(element, model({ status: 'ready', value: 1, stale: true }));
    expect(element.dataset.baseScreenDataStale).toBe('true');
    applyMaterialDataMarker(element, model({ status: 'ready', value: 2 }));
    expect(element.dataset.baseScreenDataStale).toBeUndefined();
    applyMaterialDataMarker(element, model({ status: 'ready', value: 2, stale: true }));
    applyMaterialDataMarker(element, model({ status: 'loading' }));
    expect(element.dataset.baseScreenDataStale).toBeUndefined();
  });
});
