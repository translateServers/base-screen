# Canvas Background Palette Spec

> 归档：2026-08-30（已完成）
> 状态：已归档（历史验收记录；2026-08-16）
> 依据：ADR-0048、ADR-0043、ADR-0045

## 1. 目标

把画布调色板扩展为单色、线性渐变、径向渐变三种类型。配置以严格结构化数据进入 ScreenDocument，复用既有 Core transaction、history、Renderer/Designer 同路径和失败关闭校验；既有 `backgroundColor` 文档继续按单色工作。

## 2. Requirements

### R1：ScreenCanvas 背景契约

- `ScreenCanvas` 新增可选 `background` 判别联合，类型为 `solid`、`linear-gradient` 或 `radial-gradient`。
- stop 数量为 2..8；每个 stop 的 color 为 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` 或 `transparent`，最多 128 码点；position 为有限数 `0..100`，严格升序。
- linear 的 angle 为有限数 `0..360`；radial 的 position.x/y 为有限数 `0..100`。
- `background` 缺失时，`backgroundColor` 是单色兼容回退；新单色写入同步保留 `backgroundColor`。
- JSON Schema 生成器与 golden schema 声明上述对象、枚举、边界；未知字段拒绝。

### R2：Core update-canvas

- `ScreenCanvasPatch` 增加 `background?: ScreenCanvasBackground | null`。
- `null` 删除 background 并回退到 `backgroundColor`；非法值失败关闭、无历史和文档副作用。
- `setCanvasBackground(background: ScreenCanvasBackground | null)` 经 session 事务提交；null 清除结构化背景但不清除基础 `backgroundColor`。
- 空 patch、与现状相等 patch 返回 success 且不产生变更。

### R3：Renderer CSS 投影

- solid 使用结构化 color；linear 使用角度和 stops；radial 使用中心和 stops。
- CSS 值只能由已校验的结构化字段生成；不得拼接任意用户 CSS 声明。
- `backgroundImage` 存在时保持图片为顶层，渐变层在其下；无对应层时清除 image/size/position/repeat，不能残留上一份渲染样式。
- Designer、Viewer、direct preview 共用 renderer 路径。

### R4：Designer 属性面板

- 「画布」区显示三段模式选择：单色、线性渐变、径向渐变。
- 单色显示 color 控件；线性显示角度与 stop 编辑；径向显示中心 X/Y 与 stop 编辑。
- 至少保留两个 stop；新增上限 8 个；删除最后两个之外的 stop 按钮禁用。
- 模式切换保留每种模式的本地草稿，回切恢复；提交只走 `update-canvas`。
- 控件有集中中文文案、可访问名称、稳定几何、键盘可达性，并复用既有 Designer Token。

### R5：测试与交付门禁

- contracts 覆盖三种对象合法/非法解析与 golden schema。
- core 覆盖 patch、null 删除、失败零副作用与 API 事务。
- renderer 覆盖三种 CSS、背景图叠层与清理。
- engine 面板覆盖模式、字段、stop 操作与模式草稿保留。
- 更新 baseline、ADR/Spec 索引、usage；聚焦测试和 `pnpm verify:fast` 通过。

## 3. 非目标

- Material style/property 的通用渐变能力；仅画布背景纳入本 Spec。
- 任意 CSS、图像上传、资产检索和第三方颜色编辑依赖。

## 4. 完成定义

`tasks.md` 与 `checklist.md` 全部勾选，`test-matrix.md` 反映当前用例；必需的 contracts/core/renderer/engine 检查和 `pnpm verify:fast` 通过。
