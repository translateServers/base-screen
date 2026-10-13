import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';

/**
 * 日期字段：输入框 + 锚定触发器 + 自绘日历弹层（设计原型 .datefield / .cal-popover）。
 *
 * 输入框仍是值载体：日历选日只写 input.value 并派发 change，数据集参数等既有
 * 「change → 事务」流水线零改动。日期串沿用 ISO（YYYY-MM-DD），与数据集 date 值语义一致。
 * 键盘：←/→/↑/↓ 逐日、PageUp/PageDown 换月（+Shift 换年）、Home/End 当月起止；
 * 触发器 ↑↓ 展开、Esc 关闭、点击外部关闭、贴底自动向上翻转。
 */
const CALENDAR_GRID_DAYS = 42;
const CALENDAR_POPOVER_GAP = 16;

export interface DesignerDateFieldOptions {
  /** 触发器与日历的可访问名称（如「交付日期」）。 */
  readonly label: string;
}

export interface DesignerDateFieldHandle {
  /** 包住输入框的外壳；调用方应把外壳挂到字段行里。 */
  readonly element: HTMLSpanElement;
  open(): void;
  close(): void;
  dispose(): void;
}

export function attachDesignerDateField(
  input: HTMLInputElement,
  options: DesignerDateFieldOptions,
): DesignerDateFieldHandle {
  const ownerDocument = input.ownerDocument;
  const element = ownerDocument.createElement('span');
  element.className = 'designer-date-field';
  const anchor = ownerDocument.createElement('span');
  anchor.className = 'designer-date-field-anchor';
  const trigger = ownerDocument.createElement('button');
  trigger.type = 'button';
  trigger.className = 'designer-date-field-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', DESIGNER_UI_TEXT.calendar.open(options.label));
  trigger.innerHTML = designerIcon('calendar');
  const popover = ownerDocument.createElement('section');
  popover.className = 'designer-calendar-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', options.label);
  popover.hidden = true;

  input.classList.add('designer-date-field-input');
  const parent = input.parentElement;
  if (parent !== null) parent.insertBefore(element, input);
  anchor.append(input, trigger);
  element.append(anchor, popover);

  const title = ownerDocument.createElement('span');
  title.className = 'designer-calendar-title';
  const head = ownerDocument.createElement('header');
  head.className = 'designer-calendar-head';
  const previous = createNavButton(
    ownerDocument,
    'chevron-left',
    DESIGNER_UI_TEXT.calendar.previousMonth,
  );
  const next = createNavButton(ownerDocument, 'chevron-right', DESIGNER_UI_TEXT.calendar.nextMonth);
  head.append(previous, title, next);

  const weekdays = ownerDocument.createElement('div');
  weekdays.className = 'designer-calendar-weekdays';
  weekdays.setAttribute('aria-hidden', 'true');
  for (const weekday of DESIGNER_UI_TEXT.calendar.weekdays) {
    const cell = ownerDocument.createElement('span');
    cell.textContent = weekday;
    weekdays.appendChild(cell);
  }
  const grid = ownerDocument.createElement('div');
  grid.className = 'designer-calendar-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', options.label);
  const foot = ownerDocument.createElement('footer');
  foot.className = 'designer-calendar-foot';
  const today = ownerDocument.createElement('button');
  today.type = 'button';
  today.className = 'designer-calendar-action';
  today.textContent = DESIGNER_UI_TEXT.calendar.today;
  const footValue = ownerDocument.createElement('span');
  footValue.className = 'designer-calendar-foot-value';
  foot.append(today, footValue);
  popover.append(head, weekdays, grid, foot);

  let selected = parseIsoDate(input.value);
  let view = {
    year: (selected ?? new Date()).getFullYear(),
    month: (selected ?? new Date()).getMonth(),
  };

  const syncFoot = (): void => {
    footValue.textContent =
      selected === undefined ? DESIGNER_UI_TEXT.calendar.unset : formatIsoDate(selected);
  };
  const paint = (): void => {
    const selectedIso = selected === undefined ? '' : formatIsoDate(selected);
    const todayStart = startOfToday();
    for (const day of grid.querySelectorAll<HTMLButtonElement>('[data-calendar-day]')) {
      const iso = day.dataset.calendarDay ?? '';
      day.dataset.selected = String(iso === selectedIso);
      day.dataset.today = String(iso === formatIsoDate(todayStart));
      day.tabIndex =
        iso === selectedIso || (selectedIso === '' && day.dataset.inView === 'true') ? 0 : -1;
    }
    syncFoot();
  };
  const render = (): void => {
    title.textContent = DESIGNER_UI_TEXT.calendar.monthTitle(view.year, view.month + 1);
    const first = new Date(view.year, view.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(view.year, view.month, 1 - offset);
    grid.replaceChildren();
    for (let index = 0; index < CALENDAR_GRID_DAYS; index++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const day = ownerDocument.createElement('button');
      day.type = 'button';
      day.className = 'designer-calendar-day';
      day.dataset.calendarDay = formatIsoDate(date);
      day.dataset.inView = String(date.getMonth() === view.month);
      day.dataset.outside = String(date.getMonth() !== view.month);
      day.setAttribute('aria-label', formatIsoDate(date));
      day.textContent = String(date.getDate());
      grid.appendChild(day);
    }
    paint();
  };
  const focusDay = (date: Date): void => {
    grid
      .querySelector<HTMLButtonElement>(`[data-calendar-day="${formatIsoDate(date)}"]`)
      ?.focus({ preventScroll: true });
  };
  const commit = (date: Date): void => {
    selected = date;
    if (date.getFullYear() !== view.year || date.getMonth() !== view.month) {
      view = { year: date.getFullYear(), month: date.getMonth() };
      render();
      return;
    }
    paint();
  };
  const commitToInput = (): void => {
    input.value = selected === undefined ? '' : formatIsoDate(selected);
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };
  const open = (): void => {
    const parsed = parseIsoDate(input.value);
    if (parsed !== undefined) selected = parsed;
    const anchorDate = selected ?? new Date();
    view = { year: anchorDate.getFullYear(), month: anchorDate.getMonth() };
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    element.dataset.open = 'true';
    render();
    const rect = trigger.getBoundingClientRect();
    const ownerWindow = ownerDocument.defaultView;
    if (ownerWindow !== null) {
      popover.dataset.side =
        ownerWindow.innerHeight - rect.bottom < popover.offsetHeight + CALENDAR_POPOVER_GAP &&
        rect.top > popover.offsetHeight + CALENDAR_POPOVER_GAP
          ? 'top'
          : 'bottom';
    }
    focusDay(anchorDate);
  };
  const close = (refocus: boolean): void => {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    element.dataset.open = 'false';
    if (refocus) trigger.focus({ preventScroll: true });
  };

  trigger.addEventListener('click', () => {
    if (popover.hidden) open();
    else close(true);
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && popover.hidden) {
      event.preventDefault();
      open();
    }
  });
  previous.addEventListener('click', () => {
    const norm = new Date(view.year, view.month - 1, 1);
    view = { year: norm.getFullYear(), month: norm.getMonth() };
    render();
  });
  next.addEventListener('click', () => {
    const norm = new Date(view.year, view.month + 1, 1);
    view = { year: norm.getFullYear(), month: norm.getMonth() };
    render();
  });
  today.addEventListener('click', () => {
    const date = startOfToday();
    commit(date);
    commitToInput();
    focusDay(date);
  });
  grid.addEventListener('click', (event) => {
    const day = (event.target as Element | null)?.closest<HTMLElement>('[data-calendar-day]');
    if (day === null || day === undefined) return;
    const parsed = parseIsoDate(day.dataset.calendarDay ?? '');
    if (parsed === undefined) return;
    commit(parsed);
    commitToInput();
    focusDay(parsed);
  });
  grid.addEventListener('keydown', (event) => {
    const day = (event.target as Element | null)?.closest<HTMLElement>('[data-calendar-day]');
    if (day === null || day === undefined) return;
    const base = parseIsoDate(day.dataset.calendarDay ?? '');
    if (base === undefined) return;
    const delta =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -7
            : event.key === 'ArrowDown'
              ? 7
              : 0;
    if (delta !== 0) {
      event.preventDefault();
      const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
      if (target.getMonth() !== view.month || target.getFullYear() !== view.year) {
        view = { year: target.getFullYear(), month: target.getMonth() };
        render();
      }
      focusDay(target);
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const step = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1);
      const moved = new Date(base.getFullYear(), base.getMonth() + step, 1);
      const lastDay = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate();
      const clamped = new Date(
        moved.getFullYear(),
        moved.getMonth(),
        Math.min(base.getDate(), lastDay),
      );
      view = { year: moved.getFullYear(), month: moved.getMonth() };
      render();
      focusDay(clamped);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const monthEnd = new Date(view.year, view.month + 1, 0).getDate();
      focusDay(new Date(view.year, view.month, event.key === 'Home' ? 1 : monthEnd));
    }
  });
  input.addEventListener('change', () => {
    const parsed = parseIsoDate(input.value);
    if (parsed === undefined) {
      input.value = selected === undefined ? '' : formatIsoDate(selected);
      return;
    }
    selected = parsed;
    view = { year: parsed.getFullYear(), month: parsed.getMonth() };
    if (!popover.hidden) render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && popover.hidden) {
      event.preventDefault();
      open();
    }
  });
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });
  const onDocumentPointerDown = (event: Event): void => {
    // 面板重渲染会整段替换 DOM：这里顺带回收自己的域外监听，避免每次重渲染都留一份。
    if (!element.isConnected) {
      input.ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
      return;
    }
    if (popover.hidden) return;
    // shadow 树外（宿主 document 捕获阶段）的 event.target 会被重定向为宿主元素，
    // 必须走 composedPath 取真实节点，否则弹层内部的按下会被误判成域外点击。
    const target = event.composedPath()[0] ?? event.target;
    if (target instanceof Node && element.contains(target)) return;
    close(false);
  };
  input.ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);

  render();
  return {
    element,
    open,
    close: () => close(false),
    dispose: () => {
      input.ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
      popover.remove();
    },
  };
}

function createNavButton(
  ownerDocument: Document,
  icon: 'chevron-left' | 'chevron-right',
  label: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-calendar-nav';
  button.setAttribute('aria-label', label);
  button.innerHTML = designerIcon(icon);
  return button;
}

export function parseIsoDate(text: string): Date | undefined {
  const match = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(text.trim());
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
