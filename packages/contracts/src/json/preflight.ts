import {
  DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenDiagnosticCode } from '../types/diagnostics.js';
import { escapedJsonStringByteLength, hasUnpairedSurrogate } from './canonical.js';
import { MAX_ARRAY_ITEMS, MAX_JSON_DEPTH, MAX_OBJECT_KEYS, MAX_STRING_BYTES } from './limits.js';

export type PreflightContext = {
  readonly maxBytes: number;
  readonly maxDepth?: number;
  readonly maxStringBytes?: number;
  readonly maxObjectKeys?: number;
  readonly maxArrayItems?: number;
  readonly limitCode: ScreenDiagnosticCode;
  readonly totalOverrunPath?: readonly DiagnosticSegment[];
};

type Budget = { total: number };

type WalkStatus = 'clean' | 'violated' | 'aborted';

export function preflightJsonValue(
  input: unknown,
  context: PreflightContext,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const budget: Budget = { total: 0 };
  return walkJson(input, [], 0, new Set<object>(), budget, context, collector, phase) === 'clean';
}

function walkJson(
  value: unknown,
  path: DiagnosticSegment[],
  depth: number,
  ancestors: Set<object>,
  budget: Budget,
  context: PreflightContext,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): WalkStatus {
  if (collector.full) {
    return 'aborted';
  }
  if (value === null) {
    budget.total += 4;
    return 'clean';
  }
  if (typeof value === 'boolean') {
    budget.total += value ? 5 : 4;
    return 'clean';
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      budget.total += JSON.stringify(value).length;
      return 'clean';
    }
    collector.add('JSON_NUMBER_NON_FINITE', path, phase, 'Expected a finite JSON number.');
    return 'violated';
  }
  if (typeof value === 'string') {
    let status: WalkStatus = 'clean';
    if (hasUnpairedSurrogate(value)) {
      collector.add(
        'JSON_VALUE_INVALID',
        path,
        phase,
        'String contains an unpaired UTF-16 surrogate.',
      );
      status = 'violated';
    }
    const bytes = escapedJsonStringByteLength(value);
    if (bytes > (context.maxStringBytes ?? MAX_STRING_BYTES)) {
      collector.add(
        context.limitCode,
        path,
        phase,
        `String exceeds the maximum size of ${context.maxStringBytes ?? MAX_STRING_BYTES} UTF-8 bytes.`,
      );
      return 'aborted';
    }
    budget.total += 2 + bytes;
    return status;
  }
  if (
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function' ||
    typeof value === 'undefined'
  ) {
    collector.add(
      'JSON_VALUE_INVALID',
      path,
      phase,
      `Received a value of type ${typeof value}, which is not JSON data.`,
    );
    return 'violated';
  }
  if (ancestors.has(value)) {
    collector.add('JSON_CYCLE', path, phase, 'JSON value contains a reference cycle.');
    return 'violated';
  }
  if (depth + 1 > (context.maxDepth ?? MAX_JSON_DEPTH)) {
    collector.add(
      context.limitCode,
      path,
      phase,
      `JSON nesting exceeds the maximum depth of ${context.maxDepth ?? MAX_JSON_DEPTH}.`,
    );
    return 'aborted';
  }
  ancestors.add(value);
  const status = Array.isArray(value)
    ? walkArray(value, path, depth, ancestors, budget, context, collector, phase)
    : walkObject(value, path, depth, ancestors, budget, context, collector, phase);
  ancestors.delete(value);
  return status;
}

function walkObject(
  value: object,
  path: DiagnosticSegment[],
  depth: number,
  ancestors: Set<object>,
  budget: Budget,
  context: PreflightContext,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): WalkStatus {
  let status: WalkStatus = 'clean';
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    collector.add(
      'JSON_PROTOTYPE_INVALID',
      path,
      phase,
      'Expected a plain object without a custom prototype.',
    );
    status = 'violated';
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    collector.add('JSON_VALUE_INVALID', path, phase, 'Symbol-keyed properties are not allowed.');
    return 'violated';
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length > (context.maxObjectKeys ?? MAX_OBJECT_KEYS)) {
    collector.add(
      context.limitCode,
      path,
      phase,
      `Object has more than ${context.maxObjectKeys ?? MAX_OBJECT_KEYS} own keys.`,
    );
    return 'aborted';
  }
  for (let index = 0; index < keys.length; index++) {
    if (collector.full) {
      return 'aborted';
    }
    const key = keys[index]!;
    const childPath = [...path, key];
    const descriptor = descriptors[key]!;
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      collector.add('JSON_VALUE_INVALID', childPath, phase, 'Accessor properties are not allowed.');
      status = 'violated';
      continue;
    }
    if (!descriptor.enumerable) {
      collector.add(
        'JSON_VALUE_INVALID',
        childPath,
        phase,
        'Non-enumerable properties are not allowed.',
      );
      status = 'violated';
      continue;
    }
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      collector.add(
        'JSON_DANGEROUS_KEY',
        childPath,
        phase,
        `Property name "${key}" is not allowed.`,
      );
      status = 'violated';
      continue;
    }
    if (hasUnpairedSurrogate(key)) {
      collector.add(
        'JSON_VALUE_INVALID',
        childPath,
        phase,
        'Property name contains an unpaired UTF-16 surrogate.',
      );
      status = 'violated';
      continue;
    }
    const keyBytes = escapedJsonStringByteLength(key);
    if (keyBytes > (context.maxStringBytes ?? MAX_STRING_BYTES)) {
      collector.add(
        context.limitCode,
        childPath,
        phase,
        `Property name exceeds the maximum size of ${context.maxStringBytes ?? MAX_STRING_BYTES} UTF-8 bytes.`,
      );
      return 'aborted';
    }
    const childStatus = walkJson(
      descriptor.value,
      childPath,
      depth + 1,
      ancestors,
      budget,
      context,
      collector,
      phase,
    );
    if (childStatus === 'aborted') {
      return 'aborted';
    }
    if (childStatus === 'violated') {
      status = 'violated';
    }
  }
  let structural = 2;
  for (let index = 0; index < keys.length; index++) {
    structural += 3 + escapedJsonStringByteLength(keys[index]!);
    if (index > 0) {
      structural += 1;
    }
  }
  if (!charge(budget, structural, path, context, collector, phase)) {
    return 'aborted';
  }
  return status;
}

function walkArray(
  value: object,
  path: DiagnosticSegment[],
  depth: number,
  ancestors: Set<object>,
  budget: Budget,
  context: PreflightContext,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): WalkStatus {
  let status: WalkStatus = 'clean';
  if (Object.getOwnPropertySymbols(value).length > 0) {
    collector.add('JSON_VALUE_INVALID', path, phase, 'Symbol-keyed properties are not allowed.');
    return 'violated';
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.get !== undefined ||
    lengthDescriptor.set !== undefined ||
    typeof lengthDescriptor.value !== 'number' ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    collector.add('JSON_VALUE_INVALID', path, phase, 'Array length is invalid.');
    return 'violated';
  }
  const length = lengthDescriptor.value;
  if (length > (context.maxArrayItems ?? MAX_ARRAY_ITEMS)) {
    collector.add(
      context.limitCode,
      path,
      phase,
      `Array has more than ${context.maxArrayItems ?? MAX_ARRAY_ITEMS} items.`,
    );
    return 'aborted';
  }
  let indexCount = 0;
  let structural = 2;
  const keys = Object.keys(descriptors);
  for (let index = 0; index < keys.length; index++) {
    if (collector.full) {
      return 'aborted';
    }
    const key = keys[index]!;
    if (key === 'length') {
      continue;
    }
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      const segment: DiagnosticSegment = isCanonicalArrayIndex(key) ? Number(key) : key;
      collector.add(
        'JSON_VALUE_INVALID',
        [...path, segment],
        phase,
        'Array contains an extra own property.',
      );
      status = 'violated';
      continue;
    }
    const itemIndex = Number(key);
    const descriptor = descriptors[key]!;
    const childPath = [...path, itemIndex];
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      collector.add('JSON_VALUE_INVALID', childPath, phase, 'Accessor properties are not allowed.');
      status = 'violated';
      continue;
    }
    if (!descriptor.enumerable) {
      collector.add(
        'JSON_VALUE_INVALID',
        childPath,
        phase,
        'Non-enumerable array items are not allowed.',
      );
      status = 'violated';
      continue;
    }
    indexCount++;
    const childStatus = walkJson(
      descriptor.value,
      childPath,
      depth + 1,
      ancestors,
      budget,
      context,
      collector,
      phase,
    );
    if (childStatus === 'aborted') {
      return 'aborted';
    }
    if (childStatus === 'violated') {
      status = 'violated';
    }
  }
  if (indexCount !== length) {
    collector.add('JSON_VALUE_INVALID', path, phase, 'Sparse arrays are not allowed.');
    status = 'violated';
  }
  if (indexCount > 0) {
    structural += indexCount - 1;
  }
  if (!charge(budget, structural, path, context, collector, phase)) {
    return 'aborted';
  }
  return status;
}

function charge(
  budget: Budget,
  bytes: number,
  path: DiagnosticSegment[],
  context: PreflightContext,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const next = budget.total + bytes;
  if (next > context.maxBytes) {
    const reportPath =
      context.totalOverrunPath !== undefined ? [...context.totalOverrunPath] : path;
    collector.add(
      context.limitCode,
      reportPath,
      phase,
      `Serialized value exceeds the maximum size of ${context.maxBytes} UTF-8 bytes.`,
    );
    return false;
  }
  budget.total = next;
  return true;
}

function isCanonicalArrayIndex(key: string): boolean {
  if (key === '0') {
    return true;
  }
  if (!/^[1-9][0-9]*$/.test(key)) {
    return false;
  }
  return Number(key) < MAX_ARRAY_ITEMS;
}
