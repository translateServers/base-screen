import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type DesignerSceneDescriptor,
  type DesignerSceneHandler,
} from '../../common/operations/scene/designer-scene.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 设置宿主提供的场景目录与当前场景。场景内容不在引擎里：点击场景时引擎调用
 * `setSceneHandler` 绑定的处理器，拿到命令后先在副本上试算，再以幽灵层预览。
 * 传 `undefined` 清除目录，左栏场景区随之隐藏。
 */
export function setSceneCatalog(
  element: DesignerElementHost,
  scenes: readonly DesignerSceneDescriptor[] | undefined,
  activeSceneId?: string,
): ScreenParseResult<null> {
  if (scenes !== undefined && !isSceneCatalog(scenes)) {
    return { ok: false, diagnostics: [] };
  }
  const elementState = getDesignerElementState(element);
  elementState.sceneCatalog = scenes === undefined ? undefined : [...scenes];
  elementState.sceneController.setScenes(elementState.sceneCatalog, activeSceneId);
  return { ok: true, value: null, diagnostics: [] };
}

export function setActiveScene(element: DesignerElementHost, sceneId: string | undefined): void {
  getDesignerElementState(element).sceneController.setActiveScene(sceneId);
}

export function readActiveSceneId(element: DesignerElementHost): string | undefined {
  return getDesignerElementState(element).sceneController.activeSceneId;
}

export function setSceneHandler(
  element: DesignerElementHost,
  handler: DesignerSceneHandler | undefined,
): void {
  getDesignerElementState(element).sceneController.setHandler(handler);
}

export function readSceneAvailable(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);
  return elementState.sceneCatalog !== undefined && elementState.sceneCatalog.length > 0;
}

function isSceneCatalog(scenes: readonly DesignerSceneDescriptor[]): boolean {
  const ids = new Set<string>();
  for (const scene of scenes) {
    if (typeof scene.id !== 'string' || scene.id === '') return false;
    if (typeof scene.label !== 'string' || scene.label === '') return false;
    if (ids.has(scene.id)) return false;
    ids.add(scene.id);
  }
  return true;
}
