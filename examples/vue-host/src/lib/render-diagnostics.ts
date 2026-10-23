import type { Logger } from './logger';

/**
 * 查看器渲染诊断的宿主侧浮层。
 *
 * 查看器把渲染/蓝图运行时的诊断通过 `base-screen-diagnostic` 事件交给宿主；宿主若不消费，
 * 组件校验失败时会出现「画布空白但状态显示在线」的排障黑洞。这个浮层固定在视口左上角
 * （挂在未缩放的 viewer-stage 上，避免跟随画布缩放），列出 code / path / message。
 */

interface RenderDiagnostic {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly path?: unknown;
}

export interface RenderDiagnosticsHandle {
  readonly active: () => boolean;
  dispose(): void;
}

export interface RenderDiagnosticsOptions {
  readonly viewer: HTMLElement;
  /** 未缩放的宿主容器（viewer-stage），浮层不进入画布缩放层。 */
  readonly container: HTMLElement;
  readonly logger: Logger;
  readonly onActiveChange?: (active: boolean, diagnostics: readonly RenderDiagnostic[]) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readDiagnostics(event: Event): readonly RenderDiagnostic[] {
  const detail = (event as CustomEvent<{ readonly diagnostics?: unknown }>).detail;
  if (!isRecord(detail) || !Array.isArray(detail.diagnostics)) return [];
  return detail.diagnostics.filter(isRecord);
}

function diagnosticCode(item: RenderDiagnostic): string {
  return typeof item.code === 'string' ? item.code : 'RENDER_DIAGNOSTIC';
}

function diagnosticPath(item: RenderDiagnostic): string {
  if (!Array.isArray(item.path)) return '';
  return item.path.map((segment) => String(segment)).join(' / ');
}

function diagnosticMessage(item: RenderDiagnostic): string {
  return typeof item.message === 'string' ? item.message : '';
}

export function attachRenderDiagnostics(
  options: RenderDiagnosticsOptions,
): RenderDiagnosticsHandle {
  const { viewer, container, logger, onActiveChange } = options;
  const doc = container.ownerDocument;
  let panel: HTMLDivElement | undefined;
  let latest: readonly RenderDiagnostic[] = [];

  const removePanel = (): void => {
    panel?.remove();
    panel = undefined;
  };

  const paint = (): void => {
    removePanel();
    const next = doc.createElement('div');
    next.dataset.renderDiagnostics = '1';
    next.setAttribute('role', 'alert');
    next.setAttribute('aria-live', 'assertive');
    next.style.cssText = [
      'position:fixed',
      'left:24px',
      'top:24px',
      'z-index:30',
      'width:min(560px, calc(100vw - 48px))',
      'max-height:min(420px, calc(100vh - 120px))',
      'overflow:auto',
      'box-sizing:border-box',
      'padding:14px 16px 16px',
      'border:1px solid #7f1d1d',
      'border-radius:8px',
      'background:#1b1111',
      'color:#fee2e2',
      'box-shadow:0 16px 40px rgba(0,0,0,.45)',
      'font:12px/1.65 "Microsoft YaHei UI", "PingFang SC", sans-serif',
    ].join(';');

    const head = doc.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const title = doc.createElement('strong');
    title.textContent = '大屏渲染异常';
    title.style.cssText = 'font-size:14px;font-weight:700;color:#fecaca;';
    const count = doc.createElement('span');
    count.textContent = `${latest.length} 条诊断`;
    count.style.cssText = 'color:#fca5a5;font-size:11px;';
    const collapse = doc.createElement('button');
    collapse.type = 'button';
    collapse.textContent = '收起';
    collapse.style.cssText =
      'margin-left:auto;border:0;background:transparent;color:#fca5a5;font:inherit;cursor:pointer;padding:2px 4px;';
    collapse.addEventListener('click', removePanel);
    head.append(title, count, collapse);

    const hint = doc.createElement('div');
    hint.textContent = '以下组件未通过渲染校验或运行时失败；画布可能缺少内容。';
    hint.style.cssText = 'margin-top:4px;color:#fecaca;opacity:.82;';

    const list = doc.createElement('div');
    list.style.cssText = 'margin-top:8px;';
    for (const item of latest.slice(0, 6)) {
      const row = doc.createElement('div');
      row.style.cssText =
        'padding:6px 0;border-top:1px solid rgba(248,113,113,.18);word-break:break-word;';
      const code = doc.createElement('div');
      code.textContent = diagnosticCode(item);
      code.style.cssText = 'color:#fca5a5;font-weight:600;';
      const path = diagnosticPath(item);
      const message = diagnosticMessage(item);
      const meta = doc.createElement('div');
      meta.textContent = [path, message].filter((part) => part !== '').join(' · ');
      meta.style.cssText = 'color:#fee2e2;opacity:.9;';
      row.append(code, meta);
      list.append(row);
    }
    if (latest.length > 6) {
      const more = doc.createElement('div');
      more.textContent = `另有 ${latest.length - 6} 条，详见控制台。`;
      more.style.cssText = 'padding-top:6px;color:#fca5a5;';
      list.append(more);
    }

    next.append(head, hint, list);
    container.append(next);
    panel = next;
  };

  const listener = (event: Event): void => {
    const diagnostics = readDiagnostics(event);
    if (diagnostics.length === 0) return;
    latest = diagnostics;
    logger.error('screen render diagnostics', diagnostics);
    paint();
    onActiveChange?.(true, diagnostics);
  };

  viewer.addEventListener('base-screen-diagnostic', listener);

  return {
    active: () => latest.length > 0,
    dispose: () => {
      viewer.removeEventListener('base-screen-diagnostic', listener);
      removePanel();
      latest = [];
    },
  };
}
