import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export const DESIGNER_TOOLS = [
  { id: 'select', label: '选择', materialKey: undefined },
  { id: 'hand', label: '抓手', materialKey: undefined },
  { id: 'text', label: '文本', materialKey: 'text' },
  { id: 'rectangle', label: '矩形', materialKey: 'rectangle' },
  { id: 'ellipse', label: '椭圆', materialKey: 'ellipse' },
  { id: 'image', label: '图片', materialKey: 'image' },
  { id: 'zoom', label: '缩放', materialKey: undefined },
] as const;

export type DesignerToolId = (typeof DESIGNER_TOOLS)[number]['id'];
export type DesignerToolMaterialTypes = Partial<Record<DesignerToolId, string>>;

const TOOL_SHORTCUTS: Readonly<Record<string, DesignerToolId>> = {
  v: 'select',
  h: 'hand',
  t: 'text',
  r: 'rectangle',
  e: 'ellipse',
  i: 'image',
  z: 'zoom',
};

export function getDesignerToolForShortcut(key: string): DesignerToolId | undefined {
  return TOOL_SHORTCUTS[key.toLowerCase()];
}

export function getDesignerToolShortcut(tool: DesignerToolId): string {
  return (
    Object.entries(TOOL_SHORTCUTS)
      .find(([, value]) => value === tool)?.[0]
      ?.toUpperCase() ?? ''
  );
}

export function isDesignerToolConfigured(
  tool: (typeof DESIGNER_TOOLS)[number],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
): boolean {
  const materialType = tool.materialKey === undefined ? undefined : toolMaterialTypes?.[tool.id];
  return (
    tool.materialKey === undefined ||
    (materialType !== undefined && catalog?.get(materialType) !== undefined)
  );
}
