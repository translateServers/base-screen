import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerTopbarControllerCallbacks {
  readonly getHost: () => HTMLElement;
  readonly isBackButtonVisible: () => boolean;
  readonly requestBack: () => void;
  readonly canCreateSnapshot: () => boolean;
  readonly createSnapshot: (name: string) => Promise<ScreenParseResult<unknown>>;
  readonly notify: (message: string) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerTopbarController {
  constructor(private readonly callbacks: DesignerTopbarControllerCallbacks) {}

  onClick(target: Element): boolean {
    if (target.closest('[data-topbar-back]') !== null) {
      if (this.callbacks.isBackButtonVisible()) this.callbacks.requestBack();
      return true;
    }
    if (target.closest('[data-topbar-theme-toggle]') !== null) {
      const host = this.callbacks.getHost();
      host.setAttribute('theme', host.getAttribute('theme') === 'light' ? 'dark' : 'light');
      return true;
    }
    if (target.closest('[data-topbar-snapshot]') !== null) {
      void this.createSnapshot();
      return true;
    }
    return false;
  }

  render(): void {
    const host = this.callbacks.getHost();
    const root = host.shadowRoot;
    if (root === null) return;
    const back = root.querySelector<HTMLButtonElement>('[data-topbar-back]');
    if (back !== null) back.hidden = !this.callbacks.isBackButtonVisible();
    const theme = root.querySelector<HTMLButtonElement>('[data-topbar-theme-toggle]');
    if (theme !== null) theme.ariaPressed = String(host.getAttribute('theme') === 'light');
    const snapshot = root.querySelector<HTMLButtonElement>('[data-topbar-snapshot]');
    if (snapshot === null) return;
    const available = this.callbacks.canCreateSnapshot();
    snapshot.disabled = !available;
    snapshot.title = available
      ? DESIGNER_UI_TEXT.createSnapshot
      : DESIGNER_UI_TEXT.snapshotUnavailable;
    snapshot.ariaLabel = snapshot.title;
  }

  private async createSnapshot(): Promise<void> {
    if (!this.callbacks.canCreateSnapshot()) return;
    const now = new Date();
    const defaultName = DESIGNER_UI_TEXT.snapshotDefaultName(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    );
    const host = this.callbacks.getHost();
    const requested = host.ownerDocument.defaultView?.prompt(
      DESIGNER_UI_TEXT.snapshotNamePrompt,
      defaultName,
    );
    if (requested === null || requested === undefined) return;
    const result = await this.callbacks.createSnapshot(requested.trim() || defaultName);
    if (result.ok) this.callbacks.notify(DESIGNER_UI_TEXT.snapshotCreated);
    else this.callbacks.emitDiagnostics(result.diagnostics);
  }
}
