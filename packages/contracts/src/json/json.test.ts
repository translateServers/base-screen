import { describe, expect, it } from 'vitest';
import { parseScreenJsonValue } from './parse.js';

const parse = parseScreenJsonValue;

describe('parseScreenJsonValue', () => {
  it('accepts JSON primitives and preserves -0', () => {
    expect(parse(null)).toMatchObject({ ok: true, value: null });
    expect(parse(true)).toMatchObject({ ok: true, value: true });
    expect(parse(false)).toMatchObject({ ok: true, value: false });
    expect(parse(0)).toMatchObject({ ok: true, value: 0 });
    expect(parse(1.5)).toMatchObject({ ok: true, value: 1.5 });
    expect(parse(1e21)).toMatchObject({ ok: true, value: 1e21 });
    expect(parse('text')).toMatchObject({ ok: true, value: 'text' });
    const result = parse(-0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.is(result.value, -0)).toBe(true);
    }
  });

  it('accepts nested arrays and objects', () => {
    const input = {
      list: [1, 'two', [true, null]],
      map: { a: { b: { c: 3 } } },
    };
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
    }
  });

  it('accepts unicode strings including surrogate pairs', () => {
    expect(parse('emoji \u{1f600}')).toMatchObject({ ok: true });
    expect(parse({ key: '中文' })).toMatchObject({ ok: true });
  });

  it('accepts depth exactly at the limit and rejects beyond', () => {
    const atLimit: Record<string, unknown> = { child: null };
    let cursor: Record<string, unknown> = { value: atLimit };
    for (let index = 0; index < 62; index++) {
      cursor = { child: cursor };
    }
    expect(parse(cursor)).toMatchObject({ ok: true });
    const beyond = { child: cursor };
    const result = parse(beyond);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
  });

  it('accepts Object.create(null) input and outputs plain objects', () => {
    const input = Object.create(null) as Record<string, unknown>;
    input.value = 1;
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    }
  });

  it('accepts frozen input', () => {
    expect(parse(Object.freeze({ frozen: [1, 2] }))).toMatchObject({ ok: true });
  });

  it('clones shared references into independent subtrees', () => {
    const shared = { leaf: 1 };
    const input = { first: shared, second: shared };
    const result = parse(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as { first: unknown; second: unknown };
      expect(value.first).toEqual(value.second);
      expect(value.first).not.toBe(value.second);
      expect(value.first).not.toBe(shared);
    }
  });

  it('rejects undefined, bigint, symbol and function values', () => {
    for (const input of [undefined, 1n, Symbol('x'), () => undefined]) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('JSON_VALUE_INVALID');
      }
    }
    expect(parse({ value: undefined })).toMatchObject({ ok: false });
    expect(parse({ value: 1n })).toMatchObject({ ok: false });
  });

  it('rejects non-finite numbers', () => {
    for (const input of [NaN, Infinity, -Infinity]) {
      const result = parse({ value: input });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('JSON_NUMBER_NON_FINITE');
      }
    }
  });

  it('rejects objects with custom prototypes', () => {
    const inputs: unknown[] = [
      new Date(),
      new Map(),
      new Set(),
      /regex/,
      new Error('boom'),
      Promise.resolve(1),
      new (class Sample {})() as unknown,
      Object.create({ inherited: true }),
    ];
    for (const input of inputs) {
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('JSON_PROTOTYPE_INVALID');
      }
    }
  });

  it('rejects sparse arrays, extra array properties and invalid indices', () => {
    const sparse = new Array<string>(3);
    sparse[0] = 'a';
    expect(parse(sparse)).toMatchObject({ ok: false });
    const withExtra = [1, 2];
    (withExtra as unknown as Record<string, unknown>).extra = 'x';
    expect(parse(withExtra)).toMatchObject({ ok: false });
    const withIndexBeyond = [1, 2];
    (withIndexBeyond as unknown as Record<string, unknown>)['5'] = 'x';
    expect(parse(withIndexBeyond)).toMatchObject({ ok: false });
    const withLeadingZero = [1];
    (withLeadingZero as unknown as Record<string, unknown>)['01'] = 'x';
    expect(parse(withLeadingZero)).toMatchObject({ ok: false });
  });

  it('does not invoke getters during validation', () => {
    let invoked = false;
    const input = {};
    Object.defineProperty(input, 'value', {
      enumerable: true,
      get() {
        invoked = true;
        return 1;
      },
    });
    const result = parse(input);
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_VALUE_INVALID');
    }
  });

  it('rejects symbol-keyed, non-enumerable and accessor properties', () => {
    const withSymbol = {};
    (withSymbol as Record<symbol, unknown>)[Symbol('key')] = 1;
    expect(parse(withSymbol)).toMatchObject({ ok: false });
    const withHidden = {};
    Object.defineProperty(withHidden, 'hidden', { value: 1, enumerable: false });
    expect(parse(withHidden)).toMatchObject({ ok: false });
    const withSetter = {};
    Object.defineProperty(withSetter, 'value', { set: () => undefined, enumerable: true });
    expect(parse(withSetter)).toMatchObject({ ok: false });
  });

  it('rejects dangerous prototype keys at any depth', () => {
    for (const key of ['__proto__', 'prototype', 'constructor']) {
      const input = { safe: { [key]: { nested: 1 } } };
      const result = parse(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('JSON_DANGEROUS_KEY');
        expect(result.diagnostics[0]?.path).toEqual(['safe', key]);
      }
    }
  });

  it('rejects direct and indirect reference cycles', () => {
    const direct: Record<string, unknown> = {};
    direct.self = direct;
    const directResult = parse(direct);
    expect(directResult.ok).toBe(false);
    if (!directResult.ok) {
      expect(directResult.diagnostics[0]?.code).toBe('JSON_CYCLE');
      expect(directResult.diagnostics[0]?.path).toEqual(['self']);
    }
    const indirectA: Record<string, unknown> = {};
    const indirectB: Record<string, unknown> = {};
    indirectA.next = indirectB;
    indirectB.back = indirectA;
    const indirectResult = parse({ root: indirectA });
    expect(indirectResult.ok).toBe(false);
    if (!indirectResult.ok) {
      expect(indirectResult.diagnostics[0]?.code).toBe('JSON_CYCLE');
    }
    const throughArray: unknown[] = [];
    throughArray.push(throughArray);
    expect(parse(throughArray)).toMatchObject({ ok: false });
  });

  it('rejects unpaired UTF-16 surrogates in values and keys', () => {
    const loneHigh = String.fromCharCode(0xd800);
    const loneLow = String.fromCharCode(0xdc00);
    const wrongPair = `${String.fromCharCode(0xd83d)}${String.fromCharCode(0xd83d)}`;
    expect(parse(loneHigh)).toMatchObject({ ok: false });
    expect(parse(loneLow)).toMatchObject({ ok: false });
    expect(parse({ [loneHigh]: 1 })).toMatchObject({ ok: false });
    expect(parse({ value: wrongPair })).toMatchObject({ ok: false });
  });

  it('enforces object key and array item limits', () => {
    const manyKeys: Record<string, unknown> = {};
    for (let index = 0; index < 10_000; index++) {
      manyKeys[`k${index}`] = index;
    }
    expect(parse(manyKeys)).toMatchObject({ ok: true });
    manyKeys.overflow = 1;
    const keysResult = parse(manyKeys);
    expect(keysResult.ok).toBe(false);
    if (!keysResult.ok) {
      expect(keysResult.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
    const atLimit = Array.from({ length: 100_000 }, () => 0);
    expect(parse(atLimit)).toMatchObject({ ok: true });
    const itemsResult = parse([...atLimit, 0]);
    expect(itemsResult.ok).toBe(false);
    if (!itemsResult.ok) {
      expect(itemsResult.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
  });

  it('enforces the string size limit', () => {
    const atLimit = 'a'.repeat(65_536);
    expect(parse(atLimit)).toMatchObject({ ok: true });
    const result = parse('a'.repeat(65_537));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
  });

  it('enforces the total canonical byte budget', () => {
    const content = 'a'.repeat(60_000);
    const input: Record<string, unknown> = {};
    for (let index = 0; index < 175; index++) {
      input[`k${index}`] = content;
    }
    const result = parse(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
  });

  it('applies a caller-selected budget before cloning input', () => {
    const result = parse({ nested: { value: 'a'.repeat(32) } }, { maxBytes: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('JSON_LIMIT_EXCEEDED');
    }
    expect(() => parse(null, { maxBytes: 0 })).toThrow(RangeError);
    expect(() => parse(null, { maxBytes: 10 * 1024 * 1024 + 1 })).toThrow(RangeError);
  });

  it('does not mutate input and is deterministic', () => {
    const input = { list: [1, 2, 3], map: { a: 1, b: [true, null] } };
    const snapshot = structuredClone(input);
    const first = parse(input);
    const second = parse(input);
    expect(input).toEqual(snapshot);
    expect(first).toEqual(second);
  });
});
