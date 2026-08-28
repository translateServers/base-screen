import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX,
  baseScreenDesignerLeftPanelSlotName,
  parseBaseScreenDesignerLeftPanelGroups,
} from '../src/designer-left-panel-groups.js';

describe('designer left panel host groups', () => {
  it('accepts and freezes bounded JSON-safe group descriptors', () => {
    const groups = [
      { id: 'assets', label: 'Assets', icon: 'image' },
      { id: 'ai.tools', label: 'AI tools', icon: 'sparkle' },
    ] as const;

    const result = parseBaseScreenDesignerLeftPanelGroups(groups);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(groups);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value[0])).toBe(true);
    expect(baseScreenDesignerLeftPanelSlotName('assets')).toBe(
      `${BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX}assets`,
    );
  });

  it.each([
    [[{ id: 'materials', label: 'Reserved' }], [0, 'id']],
    [[{ id: 'bad id', label: 'Bad' }], [0, 'id']],
    [[{ id: 'assets', label: ' Assets' }], [0, 'label']],
    [[{ id: 'assets', label: 'Assets\nTools' }], [0, 'label']],
    [[{ id: 'assets', label: 'Assets', icon: 'url' }], [0, 'icon']],
    [[{ id: 'assets', label: 'Assets', content: '<script>' }], [0, 'content']],
    [
      [
        { id: 'assets', label: 'Assets' },
        { id: 'assets', label: 'Duplicate' },
      ],
      [1, 'id'],
    ],
  ])('rejects unsafe or ambiguous descriptor input %#', (input, path) => {
    const result = parseBaseScreenDesignerLeftPanelGroups(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(path);
  });

  it('allows an empty projection and rejects more than six host groups', () => {
    expect(parseBaseScreenDesignerLeftPanelGroups([]).ok).toBe(true);
    expect(
      parseBaseScreenDesignerLeftPanelGroups(
        Array.from({ length: 7 }, (_, index) => ({
          id: `group-${index}`,
          label: `Group ${index}`,
        })),
      ).ok,
    ).toBe(false);
  });
});
