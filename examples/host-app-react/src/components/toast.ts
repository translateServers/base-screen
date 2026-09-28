import type React from 'react';

export type ToastTone = 'info' | 'success' | 'error';

/** 全局单例 Toast：与 Vanilla 端同一形态的实现，避免为小状态面引入运行时依赖。 */
let host: HTMLElement | undefined;

function ensureHost(): HTMLElement {
  if (host !== undefined && host.isConnected) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
  return host;
}

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const container = ensureHost();
  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  container.append(toast);
  const timer = window.setTimeout(() => toast.remove(), 4000);
  toast.addEventListener('click', () => {
    window.clearTimeout(timer);
    toast.remove();
  });
}

export type { React };
