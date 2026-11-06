import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenViewerMountOptions,
} from '@base-screen/sdk';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BaseScreenDesigner,
  type BaseScreenDesignerProps,
  BaseScreenViewer,
  type BaseScreenViewerProps,
} from '../src/index.js';

describe('Vue composition components', () => {
  it('does not register product elements from the default entry', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('exposes the runtime and mount option contracts', () => {
    expectTypeOf<BaseScreenDesignerProps['runtime']>().toEqualTypeOf<BaseScreenRuntime>();
    expectTypeOf<
      BaseScreenDesignerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenDesignerMountOptions>();
    expectTypeOf<
      BaseScreenViewerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenViewerMountOptions>();
  });

  it('declares composition props without mounting Custom Elements', () => {
    expect(Reflect.get(BaseScreenDesigner, 'name')).toBe('BaseScreenDesigner');
    expect(Reflect.get(BaseScreenViewer, 'name')).toBe('BaseScreenViewer');
    expect(typeof Reflect.get(BaseScreenDesigner, 'setup')).toBe('function');
    expect(typeof Reflect.get(BaseScreenViewer, 'setup')).toBe('function');
  });
});
