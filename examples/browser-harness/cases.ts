import {
  FEATURE_CASE_CATALOG,
  type FeatureCaseCatalogEntry,
  featureCaseQuery,
} from './feature-case-catalog.ts';

interface NavCommand {
  readonly label: string;
  readonly command: string;
}

interface BaselineEntry {
  readonly title: string;
  readonly summary: string;
  readonly href: string;
}

const BASELINES: readonly BaselineEntry[] = [
  {
    title: '全屏设计器',
    summary: 'Playwright 设计器布局，无案例舱。',
    href: './?designer',
  },
];

const ALL_PACKAGES = '全部';

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';

const PACKAGE_LIST: readonly string[] = (() => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of FEATURE_CASE_CATALOG) {
    for (const pkg of item.packages) {
      if (seen.has(pkg)) continue;
      seen.add(pkg);
      list.push(pkg);
    }
  }
  return list;
})();

const VERIFY_VALUES: readonly string[] = [
  ...new Set(FEATURE_CASE_CATALOG.map((item) => item.verify)),
];

const searchInput = document.querySelector<HTMLInputElement>('[data-nav-search]');
const packageNav = document.querySelector<HTMLElement>('[data-nav-packages]');
const countNode = document.querySelector<HTMLElement>('[data-nav-count]');
const listNode = document.querySelector<HTMLElement>('[data-nav-list]');
const baselinesNode = document.querySelector<HTMLElement>('[data-nav-baselines]');
const verifyNode = document.querySelector<HTMLElement>('[data-nav-verify]');
const statusNode = document.querySelector<HTMLElement>('[data-copy-status]');

let query = '';
let activePackage = ALL_PACKAGES;
let announceTimer = 0;

function announce(message: string): void {
  if (statusNode === null) return;
  statusNode.textContent = message;
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    statusNode.textContent = '';
  }, 2000);
}

function isFiltering(): boolean {
  return query.trim() !== '' || activePackage !== ALL_PACKAGES;
}

function matches(item: FeatureCaseCatalogEntry): boolean {
  if (activePackage !== ALL_PACKAGES && !item.packages.includes(activePackage)) return false;
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const haystack = [item.id, item.title, item.summary, item.lookAt, ...item.packages, item.focused]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

async function copyCommand(command: string, button: HTMLButtonElement): Promise<void> {
  let copied = false;
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(command);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) {
    const area = document.createElement('textarea');
    area.value = command;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
  }

  if (!copied) {
    announce('复制失败，请手动选择命令。');
    return;
  }

  announce(`已复制：${command}`);
  button.innerHTML = CHECK_ICON;
  button.dataset.copied = 'true';
  window.setTimeout(() => {
    button.innerHTML = COPY_ICON;
    delete button.dataset.copied;
  }, 1600);
}

function copyButton(command: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.title = `复制：${command}`;
  button.setAttribute('aria-label', `复制命令 ${command}`);
  button.innerHTML = COPY_ICON;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyCommand(command, button);
  });
  return button;
}

function commandRow(item: NavCommand): HTMLElement {
  const row = document.createElement('span');
  row.className = 'card-command';
  const label = document.createElement('span');
  label.className = 'cmd-label';
  label.textContent = item.label;
  const code = document.createElement('code');
  code.textContent = item.command;
  row.append(label, code, copyButton(item.command));
  return row;
}

function baselineCard(entry: BaselineEntry): HTMLElement {
  const card = document.createElement('article');
  card.className = 'card';
  const link = document.createElement('a');
  link.className = 'card-main';
  link.href = entry.href;
  const title = document.createElement('strong');
  title.className = 'card-title';
  title.textContent = entry.title;
  const summary = document.createElement('span');
  summary.className = 'card-summary';
  summary.textContent = entry.summary;
  link.append(title, summary);
  card.append(link);
  return card;
}

function caseCard(item: FeatureCaseCatalogEntry): HTMLElement {
  const card = document.createElement('article');
  card.className = 'card';

  const link = document.createElement('a');
  link.className = 'card-main';
  link.href = `./${featureCaseQuery(item)}`;

  const title = document.createElement('strong');
  title.className = 'card-title';
  title.textContent = item.title;

  const summary = document.createElement('span');
  summary.className = 'card-summary';
  summary.textContent = item.summary;

  const look = document.createElement('span');
  look.className = 'card-look';
  const label = document.createElement('b');
  label.textContent = '看：';
  look.append(label, document.createTextNode(item.lookAt));

  link.append(title, summary, look);

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const packages = document.createElement('span');
  packages.className = 'packages';
  for (const pkg of item.packages) {
    const tag = document.createElement('span');
    tag.className = 'pkg';
    tag.textContent = pkg;
    packages.append(tag);
  }
  const commands = document.createElement('span');
  commands.className = 'commands';
  commands.append(commandRow({ label: '聚焦测试', command: item.focused }));
  foot.append(packages, commands);

  card.append(link, foot);
  return card;
}

function emptyState(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'empty';
  const text = document.createElement('p');
  text.textContent = '没有匹配的案例。换个关键词，或清除筛选。';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chip';
  clear.textContent = '清除筛选';
  clear.addEventListener('click', clearFilters);
  box.append(text, clear);
  return box;
}

function clearFilters(): void {
  query = '';
  activePackage = ALL_PACKAGES;
  if (searchInput !== null) searchInput.value = '';
  renderChips();
  renderList();
}

function renderList(): void {
  if (listNode === null) return;
  const visible = FEATURE_CASE_CATALOG.filter(matches);
  listNode.replaceChildren(...(visible.length === 0 ? [emptyState()] : visible.map(caseCard)));

  if (countNode !== null) {
    const total = FEATURE_CASE_CATALOG.length;
    countNode.textContent = isFiltering()
      ? `匹配 ${visible.length} / ${total} 条`
      : `共 ${total} 条案例`;
  }
}

function renderChips(): void {
  if (packageNav === null) return;
  packageNav.replaceChildren(
    ...[ALL_PACKAGES, ...PACKAGE_LIST].map((pkg) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = pkg;
      button.setAttribute('aria-pressed', String(pkg === activePackage));
      button.addEventListener('click', () => {
        activePackage = pkg;
        renderChips();
        renderList();
      });
      return button;
    }),
  );
}

function renderVerify(): void {
  if (verifyNode === null) return;
  if (VERIFY_VALUES.length !== 1) {
    verifyNode.hidden = true;
    return;
  }
  const code = document.createElement('code');
  code.textContent = VERIFY_VALUES[0] ?? '';
  verifyNode.replaceChildren(document.createTextNode('交付前：'), code);
  verifyNode.hidden = false;
}

function bindKeyboard(): void {
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    if (
      event.key === '/' &&
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      searchInput !== null
    ) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (event.key === 'Escape') {
      if (!isFiltering()) return;
      clearFilters();
      if (searchInput !== null && target === searchInput) searchInput.blur();
      return;
    }

    if (event.key === 'Enter' && target === searchInput) {
      const first = listNode?.querySelector<HTMLAnchorElement>('a.card-main');
      if (first !== undefined && first !== null) {
        event.preventDefault();
        window.location.assign(first.href);
      }
    }
  });
}

function init(): void {
  if (searchInput !== null) {
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      renderList();
    });
  }
  if (baselinesNode !== null) baselinesNode.replaceChildren(...BASELINES.map(baselineCard));
  renderVerify();
  renderChips();
  renderList();
  bindKeyboard();
}

init();
