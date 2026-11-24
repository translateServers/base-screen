import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function tokenValue(tokens: string, name: string): string {
  const match = new RegExp(`--designer-${name}:\\s*([^;]+);`).exec(tokens);
  if (match === null) throw new Error(`missing token: ${name}`);
  return match[1]!.trim();
}

function galleryEntries(source: string, name: string): Array<[string, string]> {
  const section = new RegExp(`const ${name}:[\\s\\S]*?= \\[([\\s\\S]*?)\\];`).exec(source)?.[1];
  if (section === undefined) throw new Error(`missing gallery scale: ${name}`);
  return [...section.matchAll(/\{ name: '([^']+)', value: '([^']+)'/g)].map((match) => [
    match[1]!,
    match[2]!,
  ]);
}

describe('design system inventory stays bound to token values', () => {
  const tokens = read('packages/engine/src/browser/styles/designer-tokens.css');
  const gallery = read('tooling/verification/browser-harness/system/system-gallery.ts');

  it('renders the current spacing, radius and font-size scales', () => {
    for (const [name, value] of galleryEntries(gallery, 'SPACES')) {
      expect(tokenValue(tokens, name)).toBe(value);
    }
    for (const [name, value] of galleryEntries(gallery, 'RADII')) {
      expect(tokenValue(tokens, name)).toBe(value);
    }
    for (const [name, value] of galleryEntries(gallery, 'FONT_SIZES')) {
      expect(tokenValue(tokens, name)).toBe(value);
    }
  });

  it('does not keep stale numeric claims in the repository glossary', () => {
    const context = read('CONTEXT.md');
    expect(context).not.toContain('间距 7 档');
    expect(context).not.toContain('圆角阶梯缺 4px');
    expect(context).not.toContain('三处有意偏离');
  });

  it('documents and implements one accent-primary contract', () => {
    const actions = read(
      'packages/engine/src/browser/styles/controls/designer-controls-actions.css',
    );
    expect(gallery).toContain('button-primary-* / text-on-accent');
    expect(actions).toContain('background: var(--designer-button-primary-background);');
    expect(actions).toContain('color: var(--designer-text-on-accent);');
  });
});
