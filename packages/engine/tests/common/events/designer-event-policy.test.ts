import { describe, expect, it } from 'vitest';
import {
  type DesignerKeyboardPolicy,
  type DesignerKeyboardPolicyContext,
  resolveDesignerKeyboardPolicy,
} from '../../../src/common/events/designer-event-policy.js';
import type { DesignerKeyboardEventShape } from '../../../src/common/events/designer-key-chords.js';

interface Case {
  readonly event: Partial<DesignerKeyboardEventShape>;
  readonly context?: Partial<DesignerKeyboardPolicyContext>;
  readonly operation?: { readonly repeatable?: boolean } | undefined;
}

function key(partial: Partial<Case>): DesignerKeyboardPolicy {
  return resolveDesignerKeyboardPolicy(
    { altKey: false, ctrlKey: false, key: '', metaKey: false, shiftKey: false, ...partial.event },
    { editable: false, gestureActive: false, ...partial.context },
    () => partial.operation,
  );
}

describe('resolveDesignerKeyboardPolicy', () => {
  it('R3 blocks every key while a gesture is active', () => {
    expect(key({ event: { key: 'z', ctrlKey: true }, context: { gestureActive: true } })).toEqual({
      kind: 'block',
    });
    expect(key({ event: { key: 'a' }, context: { gestureActive: true } })).toEqual({
      kind: 'block',
    });
  });

  it('R2 allows IME composition and AltGr layouts', () => {
    expect(key({ event: { key: 'e', ctrlKey: true, isComposing: true } })).toEqual({
      kind: 'allow',
    });
    expect(key({ event: { key: 'Process' } })).toEqual({ kind: 'allow' });
    expect(key({ event: { key: '5', ctrlKey: true, altKey: true, altGraph: true } })).toEqual({
      kind: 'allow',
    });
  });

  it('R1 blocks all-target unconditional chords even on editable targets', () => {
    expect(key({ event: { key: 'F5' } })).toEqual({ kind: 'block' });
    expect(key({ event: { key: 'r', ctrlKey: true }, context: { editable: true } })).toEqual({
      kind: 'block',
    });
    expect(key({ event: { key: 'Alt' }, context: { editable: true } })).toEqual({
      kind: 'block',
    });
    // Chromium 真实形态：Alt 自身 keydown 报 altKey=true（Edge/Chrome 访问键聚焦必须被拦）。
    expect(key({ event: { key: 'Alt', altKey: true } })).toEqual({ kind: 'block' });
  });

  it('R2 routes matching operations to commands and classifies repeats', () => {
    expect(key({ event: { key: 'z', ctrlKey: true }, operation: { repeatable: false } })).toEqual({
      kind: 'command',
      chord: 'Ctrl+Z',
    });
    // 非 repeatable 操作在按住重复时不执行，但默认行为保持被阻止。
    expect(
      key({ event: { key: 'z', ctrlKey: true, repeat: true }, operation: { repeatable: false } }),
    ).toEqual({ kind: 'block' });
    expect(
      key({ event: { key: 'Delete', repeat: true }, operation: { repeatable: true } }),
    ).toEqual({ kind: 'command', chord: 'Delete' });
  });

  it('R1 blocks all-target conditional chords when no command executes', () => {
    expect(key({ event: { key: 's', ctrlKey: true } })).toEqual({ kind: 'block' });
    expect(key({ event: { key: '0', ctrlKey: true }, context: { editable: true } })).toEqual({
      kind: 'block',
    });
  });

  it('R1 preserves native text editing on editable targets', () => {
    for (const [event, operation] of [
      [{ key: 'w', ctrlKey: true }, undefined],
      [{ key: 'd', ctrlKey: true }, undefined],
      [{ key: 'z', ctrlKey: true }, { repeatable: false }],
      [{ key: 'ArrowLeft', altKey: true }, undefined],
    ] as const) {
      expect(key({ event, context: { editable: true }, operation })).toEqual({ kind: 'allow' });
    }
  });

  it('R1 blocks non-editable browser chords when no command executes', () => {
    for (const event of [
      { key: 'w', ctrlKey: true },
      { key: 't', ctrlKey: true },
      { key: 'n', ctrlKey: true },
      { key: 'p', ctrlKey: true },
      { key: 'd', ctrlKey: true },
      { key: 'h', ctrlKey: true },
      { key: 'f', ctrlKey: true },
      { key: 'ArrowLeft', altKey: true },
      { key: '/' },
      { key: "'" },
    ]) {
      expect(key({ event })).toEqual({ kind: 'block' });
    }
  });

  it('R1 executes registered operations ahead of conditional blocks', () => {
    expect(key({ event: { key: 'd', ctrlKey: true }, operation: { repeatable: false } })).toEqual({
      kind: 'command',
      chord: 'Ctrl+D',
    });
    expect(key({ event: { key: '=', ctrlKey: true }, operation: { repeatable: false } })).toEqual({
      kind: 'command',
      chord: 'Ctrl+=',
    });
  });

  it('R1 blocks Firefox quick-find only on non-editable targets', () => {
    expect(key({ event: { key: '/' } })).toEqual({ kind: 'block' });
    expect(key({ event: { key: '/' }, context: { editable: true } })).toEqual({ kind: 'allow' });
  });

  it('R2 allows unmanaged keys', () => {
    expect(key({ event: { key: 'a' } })).toEqual({ kind: 'allow' });
    expect(key({ event: { key: 'Enter' } })).toEqual({ kind: 'allow' });
    expect(key({ event: { key: 'Escape' } })).toEqual({ kind: 'allow' });
  });
});
