import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_VIEWER_TAG_NAME,
  defineBaseScreenDesigner,
  defineBaseScreenElements,
  defineBaseScreenViewer,
} from './index.js';

describe('SDK product element registration', () => {
  it('does not register product elements from the default entry', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('defines Viewer and Designer idempotently through the explicit SDK API', () => {
    const registrations = new Map<string, CustomElementConstructor>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      value: {
        get: (tagName: string) => registrations.get(tagName),
        define: (tagName: string, constructor: CustomElementConstructor) => {
          registrations.set(tagName, constructor);
        },
      },
    });
    try {
      expect(defineBaseScreenViewer().ok).toBe(true);
      expect(defineBaseScreenViewer().ok).toBe(true);
      expect(defineBaseScreenDesigner().ok).toBe(true);
      expect(defineBaseScreenElements().ok).toBe(true);
      expect(registrations.has(BASE_SCREEN_VIEWER_TAG_NAME)).toBe(true);
      expect(registrations.has(BASE_SCREEN_DESIGNER_TAG_NAME)).toBe(true);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });
});
