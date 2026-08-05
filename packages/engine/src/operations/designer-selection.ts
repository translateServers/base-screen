import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';

export function selectedComponents(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  const selected = new Set(componentIds);
  return document.components.filter((component) => selected.has(component.id));
}
