import type { ScreenJsonValue } from '../types/json.js';

const HEX = '0123456789abcdef';

export function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function codePointLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index++;
      }
    }
    length++;
  }
  return length;
}

function isShortEscape(code: number): boolean {
  return code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;
}

function utf8Bytes(code: number): number {
  if (code <= 0x7f) {
    return 1;
  }
  if (code <= 0x7ff) {
    return 2;
  }
  return 3;
}

export function escapedJsonStringByteLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      length += 2;
      continue;
    }
    if (code < 0x20) {
      length += isShortEscape(code) ? 2 : 6;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        length += 4;
        index++;
        continue;
      }
      length += 3;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      length += 3;
      continue;
    }
    length += utf8Bytes(code);
  }
  return length;
}

export function canonicalByteLength(value: ScreenJsonValue): number {
  if (value === null) {
    return 4;
  }
  if (typeof value === 'boolean') {
    return value ? 5 : 4;
  }
  if (typeof value === 'number') {
    return JSON.stringify(value).length;
  }
  if (typeof value === 'string') {
    return 2 + escapedJsonStringByteLength(value);
  }
  if (Array.isArray(value)) {
    let bytes = 2;
    for (let index = 0; index < value.length; index++) {
      if (index > 0) {
        bytes += 1;
      }
      bytes += canonicalByteLength(value[index]!);
    }
    return bytes;
  }
  const record = value as Readonly<Record<string, ScreenJsonValue>>;
  let bytes = 2;
  const keys = Object.keys(record);
  for (let index = 0; index < keys.length; index++) {
    if (index > 0) {
      bytes += 1;
    }
    const key = keys[index]!;
    bytes += 3 + escapedJsonStringByteLength(key) + canonicalByteLength(record[key]!);
  }
  return bytes;
}

export function serializeCanonicalJson(value: ScreenJsonValue): string {
  const parts: string[] = [];
  writeJsonValue(value, parts);
  return parts.join('');
}

function writeJsonString(value: string, parts: string[]): void {
  parts.push('"');
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x22) {
      parts.push('\\"');
    } else if (code === 0x5c) {
      parts.push('\\\\');
    } else if (code === 0x08) {
      parts.push('\\b');
    } else if (code === 0x09) {
      parts.push('\\t');
    } else if (code === 0x0a) {
      parts.push('\\n');
    } else if (code === 0x0c) {
      parts.push('\\f');
    } else if (code === 0x0d) {
      parts.push('\\r');
    } else if (code < 0x20) {
      parts.push(
        `\\u${HEX[(code >> 12) & 0xf]}${HEX[(code >> 8) & 0xf]}${HEX[(code >> 4) & 0xf]}${HEX[code & 0xf]}`,
      );
    } else {
      parts.push(value[index]!);
    }
  }
  parts.push('"');
}

function writeJsonValue(value: ScreenJsonValue, parts: string[]): void {
  if (value === null) {
    parts.push('null');
    return;
  }
  if (typeof value === 'boolean') {
    parts.push(value ? 'true' : 'false');
    return;
  }
  if (typeof value === 'number') {
    parts.push(JSON.stringify(value));
    return;
  }
  if (typeof value === 'string') {
    writeJsonString(value, parts);
    return;
  }
  if (Array.isArray(value)) {
    parts.push('[');
    for (let index = 0; index < value.length; index++) {
      if (index > 0) {
        parts.push(',');
      }
      writeJsonValue(value[index]!, parts);
    }
    parts.push(']');
    return;
  }
  const record = value as Readonly<Record<string, ScreenJsonValue>>;
  const keys = Object.keys(record).sort();
  parts.push('{');
  for (let index = 0; index < keys.length; index++) {
    if (index > 0) {
      parts.push(',');
    }
    const key = keys[index]!;
    writeJsonString(key, parts);
    parts.push(':');
    writeJsonValue(record[key]!, parts);
  }
  parts.push('}');
}
