import { el } from '../lib/dom';

export type ToastTone = 'info' | 'success' | 'error';

/** 全局单例 Toast：列表/编辑/查看三个视图共用，避免多个容器并存。 */
let host: HTMLElement | undefined;

function ensureHost(): HTMLElement {
  if (host !== undefined && host.isConnected) return host;
  host = el('div', { class: 'toast-host', attrs: { role: 'status', 'aria-live': 'polite' } });
  document.body.append(host);
  return host;
}

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const container = ensureHost();
  const toast = el('div', { class: `toast toast--${tone}`, text: message });
  container.append(toast);
  const timer = window.setTimeout(() => toast.remove(), 4000);
  toast.addEventListener('click', () => {
    window.clearTimeout(timer);
    toast.remove();
  });
}
