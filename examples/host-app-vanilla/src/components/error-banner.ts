import { el } from '../lib/dom';

/** 统一错误横幅：message + 重试；几何稳定（固定内边距），不引入布局抖动。 */
export function createErrorBanner(message: string, retry?: () => void): HTMLElement {
  const banner = el('div', { class: 'error-banner', attrs: { role: 'alert' } });
  banner.append(el('span', { class: 'error-banner__message', text: message }));
  if (retry !== undefined) {
    banner.append(el('button', { class: 'button', text: '重试', on: { click: retry } }));
  }
  return banner;
}
