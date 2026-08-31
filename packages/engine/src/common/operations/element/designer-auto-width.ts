import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentCommand, ScreenDocumentTransaction } from '@base-screen/core';
import { clampScreenSize, roundScreenGeometry } from './designer-geometry.js';

export function isDesignerAutoWidthText(component: ScreenComponentNode): boolean {
  return component.type === 'base.text' && component.props.autoWidth === true;
}

/** Read-only geometry input. Never pass this projection to persistence or the Renderer. */
export function projectDesignerAutoWidths(
  document: ScreenDocument,
  widths: ReadonlyMap<string, number>,
): ScreenDocument {
  let changed = false;
  const components = document.components.map((component) => {
    const width = widths.get(component.id);
    if (!isDesignerAutoWidthText(component) || width === undefined || !Number.isFinite(width)) {
      return component;
    }
    const normalized = roundScreenGeometry(clampScreenSize(width));
    if (normalized === component.size.width) return component;
    changed = true;
    return { ...component, size: { ...component.size, width: normalized } };
  });
  return changed ? { ...document, components } : document;
}

/**
 * UI geometry commands are computed against rendered bounds, but committed against the
 * canonical document. Preserve the stored width on height-only edits, and leave automatic
 * mode only when the user changes width or explicitly turns the option off.
 */
export function normalizeDesignerAutoWidthTransaction(
  document: ScreenDocument,
  geometry: ScreenDocument,
  transaction: ScreenDocumentTransaction,
): ScreenDocumentTransaction {
  const components = new Map(document.components.map((component) => [component.id, component]));
  const rendered = new Map(geometry.components.map((component) => [component.id, component]));
  const commands: ScreenDocumentCommand[] = [];
  for (const command of transaction.commands) {
    if (
      command.type !== 'update-components' ||
      !command.componentIds.some((id) => {
        const component = components.get(id);
        return component !== undefined && isDesignerAutoWidthText(component);
      })
    ) {
      commands.push(command);
      continue;
    }
    for (const id of command.componentIds) {
      const component = components.get(id);
      const displayed = rendered.get(id);
      if (
        component === undefined ||
        displayed === undefined ||
        !isDesignerAutoWidthText(component)
      ) {
        commands.push({ ...command, componentIds: [id] });
        continue;
      }
      const patch = command.patch;
      const disabled = patch.props !== undefined && patch.props.autoWidth !== true;
      const widthChanged =
        patch.size !== undefined &&
        roundScreenGeometry(patch.size.width) !== roundScreenGeometry(displayed.size.width);
      if (disabled || widthChanged) {
        commands.push({
          ...command,
          componentIds: [id],
          patch: {
            ...patch,
            props: { ...(patch.props ?? component.props), autoWidth: false },
            size: patch.size ?? { ...component.size, width: displayed.size.width },
          },
        });
      } else {
        commands.push({
          ...command,
          componentIds: [id],
          patch: {
            ...patch,
            ...(patch.size === undefined
              ? {}
              : { size: { ...patch.size, width: component.size.width } }),
          },
        });
      }
    }
  }
  return { commands };
}
