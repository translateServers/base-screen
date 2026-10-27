/**
 * Lightweight CSS block scanner for the designer style gate.
 *
 * The designer stylesheets use flat selectors plus nested `@media` / `@container` /
 * `@supports` blocks. This scanner keeps the direct declarations of every rule block,
 * resolves nested selectors (native CSS nesting is not used today, but handled for
 * safety), and ignores comments and quoted strings so semicolons in data URLs do not
 * split declarations.
 */

export function stripCssComments(css) {
  let result = '';
  let index = 0;
  let quote = '';
  while (index < css.length) {
    const char = css[index];
    if (quote !== '') {
      result += char;
      if (char === '\\') {
        index += 1;
        if (index < css.length) result += css[index];
      } else if (char === quote) {
        quote = '';
      }
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index += 1;
      continue;
    }
    if (char === '/' && css[index + 1] === '*') {
      index += 2;
      while (index < css.length && !(css[index] === '*' && css[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== '') {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

export function splitDeclarations(text) {
  const declarations = [];
  for (const part of splitTopLevel(text, ';')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const separator = splitTopLevel(trimmed, ':');
    if (separator.length < 2) continue;
    const property = separator[0].trim().toLowerCase();
    if (property === '' || property.startsWith('@')) continue;
    declarations.push({ property, value: separator.slice(1).join(':').trim() });
  }
  return declarations;
}

/**
 * @param {string} css
 * @param {{ file?: string }} [options]
 * @returns {Array<{ selector: string, fullSelector: string, atRule: boolean, declarations: Array<{ property: string, value: string }> }>}
 */
export function scanCssBlocks(css, options = {}) {
  const source = stripCssComments(css);
  const root = { tagName: 'root', fullSelector: '', atRule: true, declarations: [] };
  const stack = [root];
  const blocks = [];
  let segmentStart = 0;
  let index = 0;
  let quote = '';

  const flushSegment = (end) => {
    const segment = source.slice(segmentStart, end);
    if (segment.trim() === '') return;
    const block = stack[stack.length - 1];
    if (block === root) return;
    block.declarations.push(...splitDeclarations(segment));
  };

  while (index < source.length) {
    const char = source[index];
    if (quote !== '') {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === '{') {
      const selector = source.slice(segmentStart, index).trim();
      const parent = stack[stack.length - 1];
      const atRule = selector.startsWith('@');
      const fullSelector = atRule
        ? selector
        : parent.atRule || parent.fullSelector === ''
          ? selector
          : selector.includes('&')
            ? selector.replaceAll('&', parent.fullSelector)
            : `${parent.fullSelector} ${selector}`;
      const block = {
        file: options.file,
        selector,
        fullSelector,
        atRule,
        declarations: [],
        parent,
      };
      if (!atRule) blocks.push(block);
      stack.push(block);
      index += 1;
      segmentStart = index;
      continue;
    }
    if (char === '}') {
      flushSegment(index);
      if (stack.length > 1) stack.pop();
      index += 1;
      segmentStart = index;
      continue;
    }
    if (char === ';') {
      flushSegment(index);
      index += 1;
      segmentStart = index;
      continue;
    }
    index += 1;
  }
  flushSegment(source.length);
  return blocks;
}

export function classTokens(selector) {
  const tokens = new Set();
  for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) tokens.add(match[1]);
  return tokens;
}
