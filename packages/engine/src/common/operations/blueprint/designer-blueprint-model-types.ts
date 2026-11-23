/** 组件事件在作者面的可用性投影：manifest 声明 + 能力门禁。 */
export interface DesignerBlueprintEventOption {
  readonly componentId: string;
  readonly componentName: string;
  readonly materialType: string;
  readonly name: string;
  readonly label: string;
  readonly available: boolean;
  readonly requiredCapability?: string;
}
