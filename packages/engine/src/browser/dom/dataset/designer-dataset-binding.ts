import type { ScreenDatasetDefinition } from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import type { DesignerDatasetDraftView } from './designer-dataset-types.js';

export function isDesignerDatasetBindingValid(
  descriptor: ScreenDatasetDefinition,
  draft: DesignerDatasetDraftView | undefined,
  roles: readonly ScreenDataBindingRole[],
): boolean {
  if (roles.length === 0) return true;
  for (const role of roles) {
    const selected = draft?.fields[role.id] ?? [];
    if (
      selected.length < role.minFields ||
      selected.length > role.maxFields ||
      new Set(selected).size !== selected.length
    ) {
      return false;
    }
    if (
      selected.some((fieldId) => {
        const field = descriptor.fields.find((candidate) => candidate.id === fieldId);
        return field === undefined || !role.valueTypes.includes(field.valueType);
      })
    ) {
      return false;
    }
  }
  return true;
}
