// 统一线性图标族：24 网格 / 1.7 描边 / 圆角端点。
// A 段（含 logo 到 activity）逐字取自原型图精灵；B 段是原型未覆盖、保留项目自绘的图标；
// C 段是画布工具图标（原型只给了占位文本），与同族绘制。
const ICONS = {
  logo: '<rect x="3" y="4" width="18" height="16" rx="2.6"/><path d="M3 9h18M8.5 9v11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  save: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 21v-6h8v6"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  type: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  'chart-line': '<path d="M4 19V5M4 19h16"/><path d="M7 15l4-4 3 2.5 5-6.5"/>',
  'chart-bar': '<path d="M4 20V6M20 20V4M10 20V10M16 20V13"/>',
  table:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m20.5 16-4.5-5L8 19.5"/>',
  layers:
    '<path d="m12 3 8 4.5-8 4.5-8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/>',
  variable:
    '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 2-2 2 1 0 2 .5 2 2v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5 1 2 2 2-1 0-2 .5-2 2v2c0 2-1 3-3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M4 4l16 16"/><path d="M9.6 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.1M6.3 6.7C4 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.9-.4 4.1-1M20 15.4c.9-1.3 1.5-3.4 1.5-3.4S18 5.5 12 5.5c-.8 0-1.6.1-2.3.3"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'select-all':
    '<path d="M8 4H6a2 2 0 0 0-2 2v2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9h6v6H9z"/>',
  selection: '<rect x="4" y="4" width="11" height="11" rx="2"/><path d="M9 20h9a2 2 0 0 0 2-2V9"/>',
  paste:
    '<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1.2"/>',
  'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2M8.5 11h5M11 8.5v5"/>',
  'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2M8.5 11h5"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2.4 6.7"/><path d="M4 4v6h6"/>',
  guides: '<path d="M12 3v18M3 12h18"/><path d="M8.5 8.5h7v7h-7z"/>',
  'border-guides':
    '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16" stroke-dasharray="2 3"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash:
    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  duplicate:
    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/><path d="M14.5 11.5v6M11.5 14.5h6"/>',
  grid: '<path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  sliders:
    '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2.3"/><circle cx="9" cy="16" r="2.3"/>',
  pointer: '<path d="M5 3l6.5 16 2.4-6.2L20 10.5z"/>',
  'align-left': '<path d="M4 6h12M4 12h16M4 18h9"/>',
  'align-center': '<path d="M6 6h12M4 12h16M7 18h10"/>',
  'align-right': '<path d="M8 6h12M4 12h16M11 18h9"/>',
  'align-top': '<path d="M6 4v12M12 4v16M18 4v9"/>',
  'align-middle': '<path d="M6 7v10M12 4v16M18 9.5v5"/>',
  'align-bottom': '<path d="M6 8v12M12 4v16M18 11v9"/>',
  'distribute-h': '<path d="M4 4v16M12 4v16M20 4v16"/>',
  'distribute-v': '<path d="M4 4h16M4 12h16M4 20h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10z"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  grip: '<circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>',
  database:
    '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 12 5.7 14.3a3.5 3.5 0 0 0 5 5L13 17"/><path d="M16 12l2.3-2.3a3.5 3.5 0 0 0-5-5L11 7"/>',

  'lock-open':
    '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.9-.7"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  locate:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.6 2.6 4.8-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9.4a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1 1-1.1 1.8"/><path d="M12 17.2h.01"/>',
  pencil: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m13.5 7.5 3 3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  'bring-to-front': '<path d="M4 5h16M12 20V8M7.5 12.5 12 8l4.5 4.5"/>',
  'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  'send-to-back': '<path d="M4 19h16M12 4v12M7.5 11.5 12 16l4.5-4.5"/>',
  group:
    '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5"/>',
  ungroup:
    '<rect x="3" y="3" width="9" height="9" rx="1.5"/><rect x="12" y="12" width="9" height="9" rx="1.5"/><path d="M15 3h6v6M9 21H3v-6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  shapes: '<rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="16.5" cy="16.5" r="4.5"/>',
  terminal: '<path d="m5 7 4 4-4 4M11 15h8"/>',
  'color-solid':
    '<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" stroke="none"/>',
  'color-linear':
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M5 18 18 5M10 20 21 9"/>',
  'color-radial':
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',

  // 画布工具专属图标：原型在抓手/椭圆处只给了「未实现」文本占位，这三个是重绘的 24 网格字形，
  // 不是旧 16 网格路径的等比放大——放大只会得到与改造前完全相同的形状。
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2M11 8.5v5M8.5 11h5"/>',
} as const;

export type DesignerIconName = keyof typeof ICONS;

export function designerIcon(name: DesignerIconName): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// 画布工具图标与设计器其余部分共用同一来源：工具 id 只是注册表名的别名。
const TOOL_ICONS: Readonly<Record<string, DesignerIconName>> = {
  select: 'pointer',
  hand: 'hand',
  text: 'type',
  rectangle: 'rect',
  ellipse: 'ellipse',
  image: 'image',
  zoom: 'zoom',
} as const;

export function designerToolGlyph(id: string): string {
  const name = TOOL_ICONS[id];
  return name === undefined ? '' : designerIcon(name);
}
