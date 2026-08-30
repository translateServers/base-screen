import type { ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';

export function isControl(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const candidate = target as
    | (Partial<HTMLInputElement> & { readonly dataset?: DOMStringMap })
    | null;
  return candidate?.dataset !== undefined && typeof candidate.value === 'string';
}

export function update(
  componentId: string,
  patch: Record<string, unknown>,
): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'update-components', componentIds: [componentId], patch }],
  } as ScreenDocumentTransaction;
}

export function success(
  value: ScreenDocumentTransaction,
): ScreenParseResult<ScreenDocumentTransaction> {
  return { ok: true, value, diagnostics: [] };
}
