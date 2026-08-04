import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

export const SCREEN_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type ScreenDocumentSchemaVersion = typeof SCREEN_DOCUMENT_SCHEMA_VERSION;

export interface ScreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
}

export interface ScreenPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenComponentStatus {
  readonly locked: boolean;
  readonly hidden: boolean;
}

export interface ScreenStaticDataSource {
  readonly type: 'static';
  readonly value: ScreenJsonValue;
}

export interface ScreenHostResourceDataSource {
  readonly type: 'host-resource';
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: ScreenJsonObject;
}

export type ScreenComponentDataSource = ScreenStaticDataSource | ScreenHostResourceDataSource;

export interface ScreenComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position: ScreenPosition;
  readonly size: ScreenSize;
  readonly rotation: number;
  readonly zIndex: number;
  readonly status: ScreenComponentStatus;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly dataSource: ScreenComponentDataSource | null;
}

export interface ScreenStaticVariable {
  readonly type: 'static';
  readonly name: string;
  readonly value: ScreenJsonValue;
}

export interface ScreenBlueprintMaterialEventTrigger {
  readonly type: 'material-event';
  readonly componentId: string;
  readonly eventName: string;
}

export interface ScreenBlueprintSetVariableAction {
  readonly type: 'set-variable';
  readonly variableName: string;
  readonly value: ScreenJsonValue;
}

export interface ScreenBlueprintEmitHostEventAction {
  readonly type: 'emit-host-event';
  readonly eventName: string;
  readonly payload: ScreenJsonValue;
}

export type ScreenBlueprintAction =
  | ScreenBlueprintSetVariableAction
  | ScreenBlueprintEmitHostEventAction;

export interface ScreenBlueprintRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintMaterialEventTrigger;
  readonly actions: readonly ScreenBlueprintAction[];
}

export interface ScreenBlueprint {
  readonly apiVersion: 1;
  readonly rules: readonly ScreenBlueprintRule[];
}

export interface ScreenDocument {
  readonly schemaVersion: ScreenDocumentSchemaVersion;
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenStaticVariable[];
  readonly blueprint: ScreenBlueprint;
}
