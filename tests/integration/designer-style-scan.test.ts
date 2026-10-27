import { describe, expect, it } from 'vitest';
import {
  classTokens,
  scanCssBlocks,
  splitDeclarations,
  stripCssComments,
} from '../../tooling/checks/designer-style-scan.mjs';

describe('designer style scanner', () => {
  it('ignores comments and semicolons inside quoted values', () => {
    const css = `.a { /* ; } */ background: url("data:image/svg+xml,%3Csvg%3E;x"); color: red; }`;
    const blocks = scanCssBlocks(css);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.declarations).toEqual([
      { property: 'background', value: 'url("data:image/svg+xml,%3Csvg%3E;x")' },
      { property: 'color', value: 'red' },
    ]);
    expect(stripCssComments(css)).not.toContain('/*');
  });

  it('keeps nested at-rule declarations attached to their rule', () => {
    const css = `@media (max-width: 600px) { .a, .b { padding: 4px; color: red } }`;
    const blocks = scanCssBlocks(css);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.fullSelector).toBe('.a, .b');
    expect(blocks[0]?.declarations).toEqual([
      { property: 'padding', value: '4px' },
      { property: 'color', value: 'red' },
    ]);
  });

  it('resolves native nesting selectors', () => {
    const css = `.a { color: red; &:hover { color: blue } }`;
    const blocks = scanCssBlocks(css);

    expect(blocks.map((block) => block.fullSelector)).toEqual(['.a', '.a:hover']);
  });

  it('extracts exact class tokens', () => {
    expect([...classTokens('.designer-control.designer-select-trigger:hover, .x > .y')]).toEqual([
      'designer-control',
      'designer-select-trigger',
      'x',
      'y',
    ]);
  });

  it('splits declarations with colons and semicolons inside values', () => {
    expect(splitDeclarations('background: url(data:image/svg+xml;base64,abc); color: red')).toEqual(
      [
        { property: 'background', value: 'url(data:image/svg+xml;base64,abc)' },
        { property: 'color', value: 'red' },
      ],
    );
  });
});
