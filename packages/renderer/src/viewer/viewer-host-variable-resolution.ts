import {
  parseScreenJsonValue,
  type ScreenDocument,
  type ScreenHostVariablePort,
  type ScreenJsonValue,
} from '@base-screen/contracts';

const HOST_VARIABLE_TIMEOUT_MS = 15_000;
const HOST_VARIABLE_VALUE_BYTES = 1024 * 1024;

export async function resolveHostVariableBatch(
  document: ScreenDocument,
  port: ScreenHostVariablePort,
  controller: AbortController,
  requestedIds?: readonly string[],
): Promise<ReadonlyMap<string, ScreenJsonValue> | undefined> {
  const availableIds = new Set(
    document.variables
      .filter((variable) => variable.type === 'host')
      .map((variable) => variable.variableId),
  );
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
      [...ids].map(async (variableId) => ({
        variableId,
        result: await port.resolve({
          variableId,
          purpose: 'runtime',
          signal: controller.signal,
        }),
      })),
    );
    const settled = await Promise.race([requests, timeout]);
    if (settled === undefined || controller.signal.aborted) return undefined;
    const values = new Map<string, ScreenJsonValue>();
    for (const { variableId, result } of settled) {
      if (!result.ok) return undefined;
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
