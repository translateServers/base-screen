import type { ScreenDocument } from './document.js';
import type { ScreenJsonObject } from './json.js';

export interface ScreenProjectEnvelope {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly description: string | null;
  readonly document: ScreenDocument;
  readonly metadata: ScreenJsonObject;
}
