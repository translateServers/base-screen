import { describe, expect, it } from 'vitest';
import { screenStatePresetStyle } from '../../src/index.js';

/** 状态外观预置（ADR-0115 D8）：与原先 engine 的规则一致。 */
describe('screenStatePresetStyle', () => {
  const fields = [
    { key: 'backgroundColor', kind: 'string', color: true },
    { key: 'color', kind: 'string', color: true },
    { key: 'borderColor', kind: 'string', color: true },
    { key: 'glow', kind: 'boolean' },
    { key: 'glowColor', kind: 'string', color: true },
    { key: 'fontSize', kind: 'number' },
  ];

  it('infers the main colour, the border and, for danger, the glow', () => {
    expect(screenStatePresetStyle({ fields }, 'danger')).toEqual({
      color: 'theme:danger',
      borderColor: 'theme:danger',
      glow: true,
      glowColor: 'theme:danger',
    });
    expect(screenStatePresetStyle({ fields }, 'warning')).toEqual({
      color: 'theme:warning',
      borderColor: 'theme:warning',
    });
  });

  it('uses only the declared keys when the manifest declares them', () => {
    expect(
      screenStatePresetStyle(
        {
          declared: [
            { key: 'accent', kind: 'string' },
            { key: 'pulse', kind: 'boolean' },
          ],
          fields,
        },
        'danger',
      ),
    ).toEqual({ accent: 'theme:danger', pulse: true });
  });

  it('falls back to the first colour when every colour is a border or background', () => {
    expect(
      screenStatePresetStyle(
        { fields: [{ key: 'backgroundColor', kind: 'string', color: true }] },
        'info',
      ),
    ).toEqual({ backgroundColor: 'theme:info' });
  });
});
