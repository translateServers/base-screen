import { describe, expect, it, vi } from 'vitest';
import { DesignerTopbarController } from '../../../src/browser/controllers/designer-topbar-controller.js';

class FakeButton {
  hidden = true;
  disabled = false;
  title = '';
  ariaLabel = '';
  ariaPressed = '';

  constructor(readonly selector: string) {}

  closest(selector: string): FakeButton | null {
    return selector === this.selector ? this : null;
  }
}

class FakeRoot {
  readonly back = new FakeButton('[data-topbar-back]');
  readonly theme = new FakeButton('[data-topbar-theme-toggle]');
  readonly snapshot = new FakeButton('[data-topbar-snapshot]');

  querySelector(selector: string): FakeButton | null {
    if (selector === this.back.selector) return this.back;
    if (selector === this.theme.selector) return this.theme;
    if (selector === this.snapshot.selector) return this.snapshot;
    return null;
  }
}

class FakeHost {
  readonly root = new FakeRoot();
  readonly attributes = new Map<string, string>();
  readonly shadowRoot = this.root;
  readonly ownerDocument = { defaultView: undefined };

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function createHarness(backButton: boolean): {
  readonly controller: DesignerTopbarController;
  readonly host: FakeHost;
  readonly requestBack: ReturnType<typeof vi.fn>;
} {
  const host = new FakeHost();
  const requestBack = vi.fn();
  return {
    host,
    requestBack,
    controller: new DesignerTopbarController({
      getHost: () => host as unknown as HTMLElement,
      isBackButtonVisible: () => backButton,
      requestBack,
      canCreateSnapshot: () => false,
      createSnapshot: async () => ({ ok: true, value: null, diagnostics: [] }),
      notify: vi.fn(),
      emitDiagnostics: vi.fn(),
    }),
  };
}

describe('DesignerTopbarController host back button', () => {
  it('renders and dispatches the host back request when enabled', () => {
    const { controller, host, requestBack } = createHarness(true);

    controller.render();
    expect(host.root.back.hidden).toBe(false);
    expect(controller.onClick(host.root.back as unknown as Element)).toBe(true);
    expect(requestBack).toHaveBeenCalledOnce();
  });

  it('keeps the button hidden and ignores forged clicks when disabled', () => {
    const { controller, host, requestBack } = createHarness(false);

    controller.render();
    expect(host.root.back.hidden).toBe(true);
    expect(controller.onClick(host.root.back as unknown as Element)).toBe(true);
    expect(requestBack).not.toHaveBeenCalled();
  });
});
