/**
 * 流式落稿的增量读取（ADR-0112 §2.5）。
 *
 * 模型按 `title → subtitle → style → layout → kpis → blocks` 的顺序输出一个 JSON 对象。
 * 输出还没写完时，这里找出已经完整的部分：顶层哪些字段已经写完，`kpis` / `blocks`
 * 数组里哪些元素已经写完。只认结构，不认语义——字段是否合法由调用方按既有规则判。
 *
 * 不用「补全括号再 JSON.parse」的做法：那样会把写了一半的字符串、数字当成完整值，
 * 「286」和「2860」在流里只差一个字符，提前当真就会画出错的数。
 */
export interface StreamingSpecSnapshot {
  /** 顶层已写完的字段：键 → 该值的 JSON 原文。 */
  readonly fields: ReadonlyMap<string, string>;
  /** 顶层数组字段里已写完的元素原文，按出现顺序；数组本身可能还没写完。 */
  readonly items: ReadonlyMap<string, readonly string[]>;
}

type RootState = 'key' | 'colon' | 'value' | 'in-value' | 'after';
type ItemState = 'value' | 'in' | 'after';

export function scanStreamingSpec(text: string): StreamingSpecSnapshot {
  const fields = new Map<string, string>();
  const items = new Map<string, string[]>();
  const start = text.indexOf('{');
  if (start < 0) return { fields, items };

  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let state: RootState = 'key';
  let key = '';
  let valueStart = -1;
  // 当前顶层值是数组时，逐个记它的元素。
  let arrayKey: string | undefined;
  let itemState: ItemState = 'value';
  let itemStart = -1;

  const pushItem = (end: number) => {
    if (arrayKey === undefined || itemStart < 0) return;
    items.get(arrayKey)?.push(text.slice(itemStart, end).trim());
    itemStart = -1;
  };
  const finishValue = (end: number) => {
    fields.set(key, text.slice(valueStart, end).trim());
    valueStart = -1;
    arrayKey = undefined;
  };

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
        if (depth === 1 && state === 'key') {
          try {
            key = JSON.parse(text.slice(stringStart, index + 1)) as string;
          } catch {
            return { fields, items };
          }
          state = 'colon';
        } else if (depth === 1 && state === 'in-value' && valueStart === stringStart) {
          finishValue(index + 1);
          state = 'after';
        } else if (depth === 2 && arrayKey !== undefined && itemStart === stringStart) {
          pushItem(index + 1);
          itemState = 'after';
        }
      }
      continue;
    }
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') continue;

    if (char === '"') {
      inString = true;
      stringStart = index;
      if (depth === 1 && state === 'value') {
        valueStart = index;
        state = 'in-value';
      } else if (depth === 2 && arrayKey !== undefined && itemState === 'value') {
        itemStart = index;
        itemState = 'in';
      }
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 1 && state === 'value') {
        valueStart = index;
        state = 'in-value';
        if (char === '[') {
          arrayKey = key;
          items.set(key, []);
          itemState = 'value';
        }
      } else if (depth === 2 && arrayKey !== undefined && itemState === 'value') {
        itemStart = index;
        itemState = 'in';
      }
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      // 数组以原子值结尾（`[1, 2]`）：最后一个元素在收括号时才算写完。
      if (depth === 2 && arrayKey !== undefined && itemState === 'in' && itemStart >= 0) {
        const opener = text[itemStart];
        if (opener !== '{' && opener !== '[' && opener !== '"') pushItem(index);
      }
      depth -= 1;
      if (depth === 0) {
        if (state === 'in-value' && valueStart >= 0) finishValue(index);
        break;
      }
      if (depth === 1 && state === 'in-value') {
        finishValue(index + 1);
        state = 'after';
      } else if (depth === 2 && arrayKey !== undefined && itemState === 'in') {
        pushItem(index + 1);
        itemState = 'after';
      }
      continue;
    }

    if (char === ',') {
      if (depth === 1) {
        if (state === 'in-value' && valueStart >= 0) finishValue(index);
        state = 'key';
      } else if (depth === 2 && arrayKey !== undefined) {
        if (itemState === 'in') pushItem(index);
        itemState = 'value';
      }
      continue;
    }

    if (char === ':') {
      if (depth === 1 && state === 'colon') state = 'value';
      continue;
    }

    // 数字、true / false / null 的起点。
    if (depth === 1 && state === 'value') {
      valueStart = index;
      state = 'in-value';
    } else if (depth === 2 && arrayKey !== undefined && itemState === 'value') {
      itemStart = index;
      itemState = 'in';
    }
  }
  return { fields, items };
}
