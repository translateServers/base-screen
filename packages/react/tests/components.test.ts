import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenViewerMountOptions,
} from '@base-screen/sdk';
import { createElement } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BaseScreenDesigner,
  type BaseScreenDesignerProps,
  BaseScreenViewer,
  type BaseScreenViewerProps,
} from '../src/index.js';

describe('React composition components', () => {
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

  it('creates plain React elements without mounting Custom Elements', () => {
    const runtime = {} as BaseScreenRuntime;
    const element = createElement(BaseScreenDesigner, { runtime, mountOptions: {} });
    expect(element.type).toBe(BaseScreenDesigner);
    expect(element.props.runtime).toBe(runtime);
    expect(typeof BaseScreenDesigner).toBe('function');
    expect(typeof BaseScreenViewer).toBe('function');
  });
});
