interface NodeFileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}

interface NodeRuntime {
  getBuiltinModule(name: string): unknown;
}

function readCss(file: string): string {
  const runtime = (globalThis as typeof globalThis & { readonly process?: NodeRuntime }).process;
  const fileSystem = runtime?.getBuiltinModule('node:fs') as NodeFileSystem | undefined;
  if (fileSystem === undefined) throw new Error('NODE_BUILTIN_MODULE_UNAVAILABLE');
  return fileSystem.readFileSync(new URL(file, import.meta.url), 'utf8');
}

const baseCssFiles = [
  '../../../src/browser/styles/base/designer-base-menus.css',
  '../../../src/browser/styles/base/designer-base-library.css',
  '../../../src/browser/styles/base/designer-base-material-groups.css',
  '../../../src/browser/styles/base/designer-base-shell.css',
  '../../../src/browser/styles/base/designer-base-adaptivity.css',
] as const;
const controlsCssFiles = [
  '../../../src/browser/styles/controls/designer-controls-fields.css',
  '../../../src/browser/styles/controls/designer-controls-color-palette.css',
  '../../../src/browser/styles/controls/designer-controls-inputs.css',
  '../../../src/browser/styles/controls/designer-controls-quick-style.css',
  '../../../src/browser/styles/controls/designer-controls-actions.css',
  '../../../src/browser/styles/controls/designer-controls-descriptor.css',
] as const;
const workbenchCssFiles = [
  '../../../src/browser/styles/workbench/designer-workbench-topbar.css',
  '../../../src/browser/styles/workbench/designer-workbench-blueprint-toolbar.css',
  '../../../src/browser/styles/workbench/designer-workbench-feedback.css',
  '../../../src/browser/styles/workbench/designer-workbench-shell.css',
  '../../../src/browser/styles/workbench/designer-workbench-panels.css',
  '../../../src/browser/styles/workbench/designer-workbench-blueprint-surface.css',
  '../../../src/browser/styles/workbench/designer-workbench-blueprint-panels.css',
  '../../../src/browser/styles/workbench/designer-workbench-blueprint-details.css',
  '../../../src/browser/styles/workbench/designer-workbench-materials.css',
  '../../../src/browser/styles/workbench/designer-workbench-data-catalog.css',
  '../../../src/browser/styles/workbench/designer-workbench-data-binding.css',
  '../../../src/browser/styles/workbench/designer-workbench-data-editor.css',
  '../../../src/browser/styles/workbench/designer-workbench-layers.css',
  '../../../src/browser/styles/workbench/designer-workbench-variables.css',
  '../../../src/browser/styles/workbench/designer-workbench-variable-editor.css',
  '../../../src/browser/styles/workbench/designer-workbench-canvas.css',
  '../../../src/browser/styles/workbench/designer-workbench-inspector.css',
  '../../../src/browser/styles/workbench/designer-workbench-inspector-data.css',
  '../../../src/browser/styles/workbench/designer-workbench-selection.css',
  '../../../src/browser/styles/workbench/designer-workbench-accessibility.css',
] as const;

export const baseCss = baseCssFiles.map(readCss).join('\n');
export const controlsCss = controlsCssFiles.map(readCss).join('\n');
export const tokensCss = readCss('../../../src/browser/styles/designer-tokens.css');
export const workbenchCss = workbenchCssFiles.map(readCss).join('\n');

export function parseThemeFallback(block: string, token: string): string | undefined {
  const match = block.match(
    new RegExp(`--designer-${token}:\\s*var\\(\\s*--base-screen-designer-${token},\\s*([^)]+)\\)`),
  );
  const value = match?.[1]?.trim();
  return value === undefined || value.includes('var(') ? undefined : value;
}

function parseHex(color: string): { r: number; g: number; b: number } | undefined {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(first: string, second: string): number | undefined {
  const a = parseHex(first);
  const b = parseHex(second);
  if (a === undefined || b === undefined) return undefined;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// 黑夜是默认主题，所以暗色块与裸 `:host` 同组（`:host,\n:host([theme="dark"])`），
// 浅色块必须由 `:host([theme="light"])` 显式进入。按选择器切片而不是按固定顺序：
// 暗色块起点取 dark 选择器之前最近的 `:host,`，浅色块止于该点。
export function themeBlocks(): Record<'dark' | 'light', string> {
  const darkSelector = tokensCss.indexOf(':host([theme="dark"])');
  const darkStart = tokensCss.lastIndexOf(':host,', darkSelector);
  const lightStart = tokensCss.indexOf(':host([theme="light"])');
  return { dark: tokensCss.slice(darkStart), light: tokensCss.slice(lightStart, darkStart) };
}
