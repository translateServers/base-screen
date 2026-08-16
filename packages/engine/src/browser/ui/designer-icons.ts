const ICONS = {
  pointer:
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a16.4 16.4 0 0 1-2.3 3.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M2 2l20 20M9.9 9.9a3 3 0 1 0 4.1 4.1"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  'lock-open':
    '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.9-.7"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'chevron-down': '<path d="M5 9l7 7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  layers:
    '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
  variable: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v16M16 4v16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  chart: '<path d="M5 20V4"/><path d="M5 20h14"/><path d="M9 20v-6h3v6"/><path d="M15 20V9h3v11"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 9v11"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-8 8"/>',
  text: '<path d="M5 4h14M12 4v16M9 20h6"/>',
  container: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  shapes: '<rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="16.5" cy="16.5" r="4.5"/>',
  terminal: '<path d="m5 7 4 4-4 4M11 15h8"/>',
} as const;

export type DesignerIconName = keyof typeof ICONS;

export function designerIcon(name: DesignerIconName): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// 画布工具图标（16×16 描边风格），与设计器工具簇共用同一来源。
const TOOL_GLYPHS: Readonly<Record<string, string>> = {
  hand: 'M5 6.5a1.5 1.5 0 0 1 3 0V8h1V5a1.5 1.5 0 0 1 3 0v6.5a3.5 3.5 0 1 1-7 0z',
  text: 'M5 4h6M8 4v8M6 12h4',
  rectangle: 'M3 4h10v8H3z',
  ellipse: 'M8 3.5a4.5 3 0 1 0 0 6 4.5 3 0 0 0 0-6z',
  image: 'M3 5h10v6H3zm0 4 3-2 2 2 3-3 2 2',
  zoom: 'M6.5 6.5a3 3 0 1 0 0 0M10 10l3 3',
} as const;

export function designerToolGlyph(id: string): string {
  if (id === 'select') return designerIcon('pointer');
  const path = TOOL_GLYPHS[id];
  return path === undefined
    ? ''
    : `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
}
