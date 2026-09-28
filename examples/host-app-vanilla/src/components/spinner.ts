import { el } from '../lib/dom';

/** 骨架屏占位：尺寸固定，避免加载态与就绪态之间的布局跳动。 */
export function createSpinner(label = '加载中'): HTMLElement {
  return el('div', { class: 'spinner', attrs: { role: 'status' } }, [
    el('span', { class: 'spinner__dot' }),
    el('span', { class: 'spinner__label', text: label }),
  ]);
}
