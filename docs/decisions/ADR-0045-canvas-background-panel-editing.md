# ADR-0045：画布背景图属性面板编辑

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0043](./ADR-0043-canvas-background-image.md)（本 ADR 部分取代其非目标 1）、
> [ADR-0040](./ADR-0040-material-manifest-cover.md)（URL 校验规则同形）

## 1. 背景

ADR-0043 让宿主能够经 `setCanvasBackgroundImage` 公开 API 或文档字段给画布添加背景图片，并把
「Designer 属性面板为画布背景图增加编辑控件」列为非目标（留待后续增量）。实际操作中，设计者
需要在画布属性区直接查看/修改/清除背景图（与既有 `backgroundColor` 同区），宿主资产选择器选好
URL 后由设计者微调，或设计者直接粘贴宿主提供的资产 URL。属性面板编辑不改变任何公共契约：
它只是 `update-canvas` 事务的又一个入口，复用 ADR-0043 的失败关闭校验与 null 删除语义。

## 2. 决策

1. Designer 右侧属性面板的「画布」区新增两个控件（与 `backgroundColor` 同一 section）：
   - `backgroundImage`：文本输入框，值为当前 `canvas.backgroundImage`（无则空）。非空输入提交
     `update-canvas` patch（URL 校验失败关闭，诊断走既有面板错误通道与 `aria-invalid`）；
     清空输入提交删除语义（`backgroundImage: null` 且 `backgroundImageFit: null`，与
     `setCanvasBackgroundImage(null)` 一致）。
   - `backgroundImageFit`：下拉（`cover`/`contain`），值为当前 `canvas.backgroundImageFit`
     （未声明显示 `cover`）；无背景图时禁用；变更提交 `backgroundImageFit` patch。
2. 控件只消费既有 Designer 控件样式（`designer-control designer-input/designer-select`）与
   UI 文案集中管理（`designer-ui-text.ts`），不新增依赖、不改变主题 Token、无抖动。
3. 面板入口与宿主 API/文档入口语义完全一致：同一 canonical 校验、同一 null 删除语义、同一
   dirty/history/`base-screen-change` 通道；非法值零副作用。
4. 部分取代 ADR-0043 非目标 1 的「本期宿主经公开 API 或文档驱动；面板编辑留待后续增量」结论；
   ADR-0043 其余决策与非目标不变（面板不提供图片上传/代理/缓存，资产仍归宿主）。

## 3. 非目标

- 面板内图片上传、资产选择器、预览缩略图、代理或缓存（ADR-0027：归宿主；宿主可经资产目录端口
  自行实现选择器后调用公开 API）。
- 改变 `backgroundImage`/`backgroundImageFit` 契约、校验规则或 `update-canvas` 语义。
- 新增依赖、package 或公共 API。

## 4. 结果

- 设计者在画布属性区即可查看、设置、清除背景图与切换适配方式，与 `backgroundColor` 同区一致；
  宿主能力（API/文档入口）保持不变，三条入口语义完全一致。
- 公共边界零变化：全部经既有 `update-canvas` 事务与 canonical 校验，由专项 Spec 增量与聚焦测试验收。
