/**
 * 流式落稿的增量读取（ADR-0112 §2.5 / ADR-0113 §2.8）。
 *
 * 模型按 `title → subtitle → style → layout → kpis / regions` 的顺序输出一个 JSON 对象。输出还没写完时，
 * 这里找出已经完整的部分，按**位置路径**给出它们的 JSON 原文：
 *
 * - 顶层字段：`title` / `subtitle` / `style` / `layout`；
 * - 平铺写法的元素：`kpis[i]`、`blocks[i]`；
 * - 区域写法的元素：`regions[r].items[i]` / `.blocks[i]` / `.main[i]` / `.rail[i]`。
 *
 * 只认结构，不认语义：字段是否合法由宿主用 host-kit 按既有规则判。
 *
 * 不用「补全括号再 JSON.parse」的做法：那样会把写了一半的字符串、数字当成完整值，
 * 「286」和「2860」在流里只差一个字符，提前当真就会画出错的数。数字与字面量要看到分隔符才算写完。
 */

const REPORTABLE =
  /^(?:title|subtitle|style|layout|kpis\[\d+\]|blocks\[\d+\]|regions\[\d+\]\.(?:items|blocks|main|rail)\[\d+\])$/;

/** 取不到完整值（还没写完或不是合法 JSON）。 */
const INCOMPLETE = -1;

export function scanStreamingPaths(text: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const start = text.indexOf('{');
  if (start < 0) return found;

  const skip = (from: number): number => {
    let index = from;
    while (index < text.length) {
      const char = text[index];
      if (char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t') break;
      index += 1;
    }
    return index;
  };

  const readString = (from: number): number => {
    let index = from + 1;
    while (index < text.length) {
      const char = text[index];
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '"') return index + 1;
      index += 1;
    }
    return INCOMPLETE;
  };

  const readLiteral = (from: number): number => {
    let index = from;
    while (index < text.length) {
      const char = text[index];
      if (
        char === ',' ||
        char === '}' ||
        char === ']' ||
        char === ' ' ||
        char === '\n' ||
        char === '\r' ||
        char === '\t'
      ) {
        return index > from ? index : INCOMPLETE;
      }
      index += 1;
    }
    // 到文本末尾还没看到分隔符：数字可能还没写完。
    return INCOMPLETE;
  };

  const readValue = (from: number, path: string): number => {
    const at = skip(from);
    if (at >= text.length) return INCOMPLETE;
    const char = text[at];
    let end: number;
    if (char === '"') end = readString(at);
    else if (char === '{') end = readObject(at, path);
    else if (char === '[') end = readArray(at, path);
    else end = readLiteral(at);
    if (end === INCOMPLETE) return INCOMPLETE;
    if (REPORTABLE.test(path)) found.set(path, text.slice(at, end).trim());
    return end;
  };

  const readObject = (from: number, path: string): number => {
    let index = skip(from + 1);
    if (text[index] === '}') return index + 1;
    for (;;) {
      index = skip(index);
      if (text[index] !== '"') return INCOMPLETE;
      const keyEnd = readString(index);
      if (keyEnd === INCOMPLETE) return INCOMPLETE;
      let key: string;
      try {
        key = JSON.parse(text.slice(index, keyEnd)) as string;
      } catch {
        return INCOMPLETE;
      }
      index = skip(keyEnd);
      if (text[index] !== ':') return INCOMPLETE;
      const valueEnd = readValue(index + 1, path === '' ? key : `${path}.${key}`);
      if (valueEnd === INCOMPLETE) return INCOMPLETE;
      index = skip(valueEnd);
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      return text[index] === '}' ? index + 1 : INCOMPLETE;
    }
  };

  const readArray = (from: number, path: string): number => {
    let index = skip(from + 1);
    if (text[index] === ']') return index + 1;
    for (let position = 0; ; position += 1) {
      const valueEnd = readValue(index, `${path}[${position}]`);
      if (valueEnd === INCOMPLETE) return INCOMPLETE;
      index = skip(valueEnd);
      if (text[index] === ',') {
        index += 1;
        continue;
      }
      return text[index] === ']' ? index + 1 : INCOMPLETE;
    }
  };

  readObject(start, '');
  return found;
}
