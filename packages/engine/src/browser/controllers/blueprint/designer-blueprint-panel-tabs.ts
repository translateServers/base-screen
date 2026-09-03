import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
} from '../../../common/operations/workbench/designer-left-panel-groups.js';
import type { DesignerBlueprintInspectorTab } from '../../dom/blueprint/designer-blueprint-inspector-dom.js';
import {
  type DesignerBlueprintLibraryTab,
  isDesignerBlueprintLibraryBuiltinTab,
} from '../../dom/blueprint/designer-blueprint-library-dom.js';
import { hostLeftPanelGroupId } from '../../dom/designer-left-panel-groups-dom.js';

export function isLibraryTab(
  value: string | undefined,
  groups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined,
): value is DesignerBlueprintLibraryTab {
  if (value === undefined) return false;
  if (isDesignerBlueprintLibraryBuiltinTab(value)) return true;
  const groupId = hostLeftPanelGroupId(value);
  return (
    groupId !== undefined &&
    groups?.some(
      (group) =>
        group.id === groupId && baseScreenDesignerLeftPanelGroupSupportsMode(group, 'blueprint'),
    ) === true
  );
}

export function isInspectorTab(value: string | undefined): value is DesignerBlueprintInspectorTab {
  return value === 'configuration' || value === 'problems' || value === 'trace';
}
