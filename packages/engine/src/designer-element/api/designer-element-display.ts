import type { ScreenTargetDisplayProfile } from '@base-screen/contracts';
import type {
  DesignerDisplayMetrics,
  DesignerDisplayOverlayKind,
} from '../../common/operations/display/designer-target-display.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/** 目标屏物理参数（宿主提供）：只驱动画布叠加，不写入 Screen Document。 */
export function setTargetDisplayProfile(
  element: DesignerElementHost,
  profile: ScreenTargetDisplayProfile | undefined,
): void {
  getDesignerElementState(element).targetDisplayController.setProfile(profile);
}

export function setTargetDisplayOverlay(
  element: DesignerElementHost,
  kind: DesignerDisplayOverlayKind,
  enabled: boolean,
): void {
  getDesignerElementState(element).targetDisplayController.setOverlay(kind, enabled);
}

export function readTargetDisplayProfile(
  element: DesignerElementHost,
): ScreenTargetDisplayProfile | undefined {
  return getDesignerElementState(element).targetDisplayController.profile;
}

export function readTargetDisplayOverlay(
  element: DesignerElementHost,
  kind: DesignerDisplayOverlayKind,
): boolean {
  return getDesignerElementState(element).targetDisplayController.isOverlayEnabled(kind);
}

/** 目标屏验收读数：物理尺寸、视角、最小可读字号；参数缺失的项为 null。 */
export function readDisplayMetrics(
  element: DesignerElementHost,
): DesignerDisplayMetrics | undefined {
  return getDesignerElementState(element).targetDisplayController.readMetrics();
}
