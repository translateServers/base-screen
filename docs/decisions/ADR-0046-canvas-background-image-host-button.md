# ADR-0046：画布背景图宿主选择按钮

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0043](./ADR-0043-canvas-background-image.md)、[ADR-0045](./ADR-0045-canvas-background-panel-editing.md)
> （面板编辑增量）、[ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)
> （requestId/身份守护与宿主提交语义同构）、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)

## 1. 背景

ADR-0045 让属性面板「画布」区可以直接输入背景图 URL，但真实业务中背景图通常来自宿主的资产库，
需要**可视化选择**：点击按钮 → 宿主打开自己的图片选择弹出框（缩略图网格/搜索/上传）→ 确认后把
选中的图片注入画布。资产目录、缩略图与上传按 ADR-0027 归宿主，Base Screen 不应内嵌选择器，但应
为宿主提供稳定的「按钮 → 请求 → 提交」通道。ADR-0028 的宿主作者桥（requestId/实例守护 + 专用
提交入口）正是这类「宿主弹出编辑器并提交」的既有语义，本 ADR 将其同构应用于背景图选择。

## 2. 决策

1. 属性面板「画布」区背景图片输入框旁新增宿主选择按钮（`designer-control designer-button`，
   `data-canvas-background-image-action`，文案走 `designer-ui-text.ts`）。按钮始终渲染，点击派发
   composed 宿主事件 `base-screen-canvas-background-image-request`（detail 形如
   `{ request: BaseScreenCanvasBackgroundImageRequest }`），其中 request 含 `requestId`、
   `instanceId`、`documentRevision` 与 `current: { backgroundImage, backgroundImageFit }`。
   事件常量与类型从 `@base-screen/engine` 导出。
2. `BaseScreenDesignerElement` 新增公开方法：
   - `requestCanvasBackgroundImage(): boolean`：有文档时登记宿主会话并派发上述事件（返回 true）；
     无文档返回 false。宿主可在面板按钮之外直接调用。
   - `commitCanvasBackgroundImage(requestId: string, backgroundImage: string | null,
     fit?: ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>`：守卫为 pending 会话
     kind 匹配且未过期（unload/文档替换使会话失效，复用 authoring 会话失效语义）；提交经
     `update-canvas` 事务（`null` 清除背景并同时清除 fit，失败关闭零副作用，与
     `setCanvasBackgroundImage` 同语义）；成功即消费会话。
3. 宿主提交路径二选一：经 `commitCanvasBackgroundImage`（带会话守护，推荐，与 ADR-0028 同构），
   或直接调用既有 `setCanvasBackgroundImage`（无会话语义）。按钮事件只承载请求，不承载结果；
   宿主弹出框、资产目录、缩略图、搜索与上传全部归宿主。
4. 未接入的宿主：按钮点击仅派发事件，无其他副作用；公共契约变更 additive（新事件 + 两个新方法 +
   一个面板按钮），既有文档/API/校验语义不变。
5. 不新增依赖、不新增 package；事件 detail 只含 JSON-safe 值；requestId 生成复用
   `createScreenAuthoringRequestId`。

## 3. 非目标

- 面板内嵌图片选择器、资产浏览、缩略图网格、搜索或上传（ADR-0027：归宿主）。
- 改变 `backgroundImage`/`backgroundImageFit` 契约、校验规则或 `update-canvas` 语义。
- 宿主弹出框与 Designer 的坐标/生命周期联动（ADR-0044 结论不变）。
- 新增依赖、package 或传输配置。

## 4. 结果

- 宿主获得稳定的「按钮 → 宿主弹出框 → 可视化选择 → 注入」通道：按钮触发请求事件，宿主自选提交
  路径，带 requestId 守护的提交防过期/串会话；未接入宿主零影响。
- 公共边界变化 additive，由专项 Spec 增量、聚焦测试与真实浏览器回归验收。
