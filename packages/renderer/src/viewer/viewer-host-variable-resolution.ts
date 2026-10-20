import {
  parseScreenJsonValue,
  type ScreenDocument,
  type ScreenHostVariablePort,
  type ScreenJsonValue,
} from '@base-screen/contracts';
import { hostResolvedVariables, readHostVariableRequest } from './viewer-variable-request.js';

const HOST_VARIABLE_TIMEOUT_MS = 15_000;
const HOST_VARIABLE_VALUE_BYTES = 1024 * 1024;

export async function resolveHostVariableBatch(
  document: ScreenDocument,
  port: ScreenHostVariablePort,
  controller: AbortController,
  requestedIds?: readonly string[],
): Promise<ReadonlyMap<string, ScreenJsonValue> | undefined> {
  const available = hostResolvedVariables(document);
  const availableIds = new Set(available.map((entry) => entry.id));
  const ids = new Set(
    requestedIds === undefined
      ? availableIds
      : requestedIds.filter((variableId) => availableIds.has(variableId)),
  );
  if (ids.size === 0) return new Map();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, HOST_VARIABLE_TIMEOUT_MS);
  });
  try {
    const requests = Promise.all(
      [...ids].map(async (variableId) => {
        const entry = available.find((candidate) => candidate.id === variableId);
        const request =
          entry === undefined
            ? undefined
            : readHostVariableRequest(document, entry, 'runtime', controller.signal);
        return {
          variableId,
          result: request === undefined ? undefined : await port.resolve(request),
        };
      }),
    );
    const settled = await Promise.race([requests, timeout]);
    if (settled === undefined || controller.signal.aborted) return undefined;
    const values = new Map<string, ScreenJsonValue>();
    for (const { variableId, result } of settled) {
      if (result === undefined || !result.ok) return undefined;
      const parsed = parseScreenJsonValue(result.value, { maxBytes: HOST_VARIABLE_VALUE_BYTES });
      if (!parsed.ok) return undefined;
      values.set(variableId, parsed.value);
    }
    return values;
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
