# ADR-0048：画布背景调色板

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0002](./ADR-0002-canonical-screen-document.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0043](./ADR-0043-canvas-background-image.md)、[ADR-0045](./ADR-0045-canvas-background-panel-editing.md)
> 参考行为：[Light Chaser ColorMode](https://github.com/xiaopujun/light-chaser) 的模式切换与按模式保留编辑值；不复制其实现或受其许可限制的代码。

## 1. 背景

现有 `ScreenCanvas.backgroundColor` 只能表达单色。大屏模板常需要受控的线性或径向渐变，但不能把任意 CSS 字符串写入 canonical document：这会损失结构化校验、编辑器可预期性和失败关闭边界。

## 2. 决策

1. `ScreenCanvas` 新增可选 `background?: ScreenCanvasBackground`。它是严格 JSON-safe 判别联合：
   - `{ type: 'solid', color: string }`
   - `{ type: 'linear-gradient', angle: number, stops: readonly ScreenCanvasColorStop[] }`
   - `{ type: 'radial-gradient', position: { x: number, y: number }, stops: readonly ScreenCanvasColorStop[] }`
2. `ScreenCanvasColorStop` 为 `{ color: string, position: number }`。渐变必须有 2 至 8 个 stop，位置为闭区间 `0..100` 的有限数、按升序排列；颜色为非空的 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` 或 `transparent`，最大 128 码点。线性角度为 `0..360` 的有限数；径向中心 `x`、`y` 均为 `0..100` 的有限数。
3. `background` 未声明的既有文档仍将 `backgroundColor` 解释为单色。新写入的单色模式同时写 `background` 与 `backgroundColor`，使旧宿主读取 `backgroundColor` 时仍有正确的基础色；渐变模式保留 `backgroundColor` 作为无渐变浏览器与背景图加载失败时的基础底色。
4. `update-canvas` patch 接受 `background?: ScreenCanvasBackground | null`；`null` 删除该可选字段，回退为既有 `backgroundColor` 单色语义。未知键、空对象、判别字段不匹配、越界或未排序 stop 均失败关闭。
5. Renderer 把结构化背景确定性投影为 CSS：单色设置 `background-color`；线性渐变设置 `linear-gradient(<angle>deg, ...)`；径向渐变设置 `radial-gradient(circle at <x>% <y>%, ...)`。若同时存在 `backgroundImage`，图片保持最上层，调色板渐变位于图片之下，二者共同位于基础背景色之上；清除任一层不得残留 CSS 长列表属性。
6. Designer 画布属性面板提供固定尺寸的三段模式控件，以及与所选模式对应的输入：单色色板、线性角度和可编辑 stops、径向中心和可编辑 stops。切换模式保留每种模式的本地草稿，只有有效的值才经 `update-canvas` 提交。控件继续使用现有样式 Token、集中 UI 文案和诊断通道。
7. 新增宿主 API `setCanvasBackground(background: ScreenCanvasBackground | null)`，经既有 session 事务、历史、脏标记与 `base-screen-change` 通道提交。它不处理资源上传、图片选择、网络请求或 CSS 任意值注入。

## 3. 非目标

- 将任意 CSS `background` 字符串、SVG、函数、DOM 节点或宿主服务写入文档。
- 多层任意渐变、图片上传、资产代理、预取、缓存或失败重试。
- 改动 Material Manifest `color` 控件的标量字符串契约；文字、边框等不接受渐变的 CSS 属性保持原语义。
- 新增依赖或 package。

## 4. 结果

- 画布可持久化、可校验地使用单色、线性渐变或径向渐变，并在 Designer、预览和 Viewer 中一致展示。
- 旧文档与只读取 `backgroundColor` 的宿主保持可用，背景图片仍按既有宿主边界处理。
