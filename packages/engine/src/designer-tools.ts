import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export const DESIGNER_TOOLS = [
  { id: 'select', label: 'Select', materialKey: undefined },
  { id: 'hand', label: 'Hand', materialKey: undefined },
  { id: 'text', label: 'Text', materialKey: 'text' },
  { id: 'rectangle', label: 'Rectangle', materialKey: 'rectangle' },
  { id: 'ellipse', label: 'Ellipse', materialKey: 'ellipse' },
  { id: 'image', label: 'Image', materialKey: 'image' },
  { id: 'zoom', label: 'Zoom', materialKey: undefined },
] as const;

export type DesignerToolId = (typeof DESIGNER_TOOLS)[number]['id'];
export type DesignerToolMaterialTypes = Partial<Record<DesignerToolId, string>>;

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

export function updateDesignerTools(
  root: ParentNode,
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
  activeTool: DesignerToolId = 'select',
): void {
  for (const tool of DESIGNER_TOOLS) {
    const control = root.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`);
    if (control === null) continue;
    control.disabled = !isDesignerToolConfigured(tool, toolMaterialTypes, catalog);
    control.ariaPressed = String(tool.id === activeTool);
  }
}
