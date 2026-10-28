import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  type ScreenDocumentCommand,
  type ScreenTransactionProvenance,
} from '@base-screen/core';

/** 场景应用成功后广播给宿主：引擎不等宿主轮询，也不把场景写进 Screen Document。 */
export const BASE_SCREEN_SCENE_CHANGE_EVENT = 'base-screen-scene-change';

export interface BaseScreenSceneChangeDetail {
  readonly sceneId: string;
  readonly label: string;
}

/** 宿主提供的场景：只描述身份与展示名，内容由宿主的场景处理器产出。 */
export interface DesignerSceneDescriptor {
  readonly id: string;
  readonly label: string;
}

/**
 * 一次场景切换请求。`document` 是当前 canonical 文档，宿主据此把目标场景翻译成命令；
 * 引擎不保存场景定义，也不推断场景内容。
 */
export interface DesignerSceneRequest {
  readonly instanceId: string;
  readonly sceneId: string;
  readonly document: ScreenDocument;
}

/**
 * 场景处理器产出的一批命令。场景切换是整套布局与数据绑定的替换，因此 commands 必须
 * 让文档产生差异；空命令或零差异按失败关闭处理，不生成预览。
 */
export interface DesignerScenePlan {
  readonly commands: readonly ScreenDocumentCommand[];
}

/**
 * 宿主实现的场景处理器：异步准备命令，失败时返回诊断。引擎不会调用模型，
 * 也不按场景名猜测内容。
 */
export type DesignerSceneHandler = (
  request: DesignerSceneRequest,
) => Promise<ScreenParseResult<DesignerScenePlan>>;

export interface DesignerScenePreview {
  readonly sceneId: string;
  readonly label: string;
  readonly commands: readonly ScreenDocumentCommand[];
  readonly candidate: ScreenDocument;
  readonly provenance: ScreenTransactionProvenance;
}

export type DesignerScenePrepareResult =
  | { readonly ok: true; readonly value: DesignerScenePreview }
  | { readonly ok: false; readonly diagnostics: readonly ScreenDiagnostic[] };

/**
 * 把宿主产出的场景命令编译成候选文档：整批命令在副本上试算，全部成功且确有差异才产出
 * 预览；任何一步失败都不返回半成品，预览层因此永远等于一次可提交的事务。
 */
export function prepareDesignerScenePreview(
  document: ScreenDocument,
  scene: DesignerSceneDescriptor,
  plan: DesignerScenePlan,
): DesignerScenePrepareResult {
  if (plan.commands.length === 0) return { ok: false, diagnostics: [] };
  const result = applyScreenDocumentTransaction(document, { commands: plan.commands });
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
  if (JSON.stringify(result.document) === JSON.stringify(document)) {
    return { ok: false, diagnostics: [] };
  }
  return {
    ok: true,
    value: {
      sceneId: scene.id,
      label: scene.label,
      commands: plan.commands,
      candidate: result.document,
      provenance: {
        source: 'manual',
        label: sceneLabel(scene.label),
      },
    },
  };
}

export function sceneLabel(label: string): string {
  return `场景切换 · ${label}`;
}
