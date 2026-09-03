import {
  parseScreenJsonValue,
  type ScreenDocument,
  type ScreenDynamicVariable,
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
      .filter((variable): variable is ScreenDynamicVariable => variable.type !== 'static')
      .map((variable) => variable.id),
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
      [...ids].map(async (variableId) => {
        const variable = document.variables.find(
          (candidate): candidate is ScreenDynamicVariable =>
            candidate.id === variableId && candidate.type !== 'static',
        )!;
        return {
          variableId,
          result: await port.resolve({
            variableId: variable.id,
            sourceId: variable.sourceId,
            sourceType: variable.type,
            initialValue: variable.initialValue,
            controlled: variable.controlled,
            ...(variable.processorId === undefined ? {} : { processorId: variable.processorId }),
            ...(variable.type === 'data-source' && variable.autoUpdate !== undefined
              ? { autoUpdate: variable.autoUpdate }
              : {}),
            purpose: 'runtime',
            signal: controller.signal,
          }),
        };
      }),
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
