import type { BaseScreenBlueprintCanvasEventOption } from './designer-blueprint-protocol.js';

export interface DesignerBlueprintEventOption extends BaseScreenBlueprintCanvasEventOption {
  readonly componentId: string;
  readonly componentName: string;
  readonly materialType: string;
}
