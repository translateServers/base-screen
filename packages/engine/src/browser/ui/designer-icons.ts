const ICONS = {
  pointer:
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>',
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
