import { describe, expect, it } from 'vitest';
import {
  type DesignerKeyboardEventShape,
  designerChordFromKeyboardEvent,
} from '../../../src/common/events/designer-key-chords.js';

function chord(partial: Partial<DesignerKeyboardEventShape>): string | undefined {
  return designerChordFromKeyboardEvent({
    altKey: false,
    ctrlKey: false,
    key: '',
    metaKey: false,
    shiftKey: false,
    ...partial,
  });
}

describe('designerChordFromKeyboardEvent', () => {
  it('R2 normalizes plain keys and modifier prefixes', () => {
    expect(chord({ key: 'z', ctrlKey: true })).toBe('Ctrl+Z');
    expect(chord({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+Z');
    expect(chord({ key: 'z', ctrlKey: true, altKey: true })).toBe('Ctrl+Alt+Z');
    expect(chord({ key: 'ArrowLeft' })).toBe('ArrowLeft');
    expect(chord({ key: 'F5' })).toBe('F5');
  });

  it('R2 maps Cmd to Ctrl so macOS and Windows share command metadata', () => {
    expect(chord({ key: 's', metaKey: true })).toBe('Ctrl+S');
  });

  it('R2 normalizes Backspace to Delete', () => {
    expect(chord({ key: 'Backspace' })).toBe('Delete');
  });

  it('R2 guards IME composition from command chords', () => {
    expect(chord({ key: 'e', ctrlKey: true, isComposing: true })).toBeUndefined();
    expect(chord({ key: 'Process', ctrlKey: true })).toBeUndefined();
  });

  it('R2 guards AltGr layouts from Alt command chords', () => {
    expect(chord({ key: '5', ctrlKey: true, altKey: true, altGraph: true })).toBeUndefined();
  });
});
