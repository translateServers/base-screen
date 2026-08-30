import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenDesignerSetWorkbenchModeOptions,
  BaseScreenDesignerWorkbenchMode,
} from '../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function readWorkbenchMode(element: DesignerElementHost): BaseScreenDesignerWorkbenchMode {
  return getDesignerElementState(element).blueprintWorkbenchController.mode;
}

export function setWorkbenchMode(
  element: DesignerElementHost,
  mode: BaseScreenDesignerWorkbenchMode,
  options: BaseScreenDesignerSetWorkbenchModeOptions = {},
): ScreenParseResult<null> {
  return getDesignerElementState(element).blueprintWorkbenchController.setMode(
    mode,
    options,
    'api',
  );
}
