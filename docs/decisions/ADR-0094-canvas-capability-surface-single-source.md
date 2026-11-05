# ADR-0094：画布能力面以契约为唯一来源

> 状态：已接受
> 日期：2026-11-05
> 关联：ADR-0043（画布命令与可选字段的删除语义）、ADR-0089（宿主自有图片资产与统一资源选择）、ADR-0090（在线物料包与 catalog 热刷新）。

## 背景

画布背景早就支持线性渐变与径向渐变：契约 `ScreenCanvas.background` 是 `solid | linear-gradient | radial-gradient` 三态，渲染层把它拼成 `background-image` 图层，设计器右栏「画布 › 背景」用的就是同一个调色板控件（`allowGradient: true`），`update-canvas` 的 patch 也接受 `background`。

但用户在智能体面板里说「把背景颜色改为渐变的天蓝色」时，得到的是：

> 画布目前只支持纯色背景，可改为「背景色设为 #87CEEB」，或提供一张天蓝渐变图片 URL 我用背景图方式铺满。

这句拒绝是错的，而且错得没有任何报错：能力面在五处各写了一份子集——

1. 契约 `canvasSchema` 与 `validate-canvas` 的字段/调色板规则（权威）；
2. `core` 里 `update-canvas` 的 patch 白名单（键集合的副本）；
3. 设计器画布调色板（消费契约类型，正确）；
4. 示例后端 `agent-canvas` 规则 + `set_canvas` 工具 schema + `readCanvasPatch`（只认 `backgroundColor / backgroundImage`）；
5. 三个宿主 `compileCanvasCommands` 的白名单与色值正则（同样只认那三个键）。

契约加渐变时，4 与 5 不会报错，只会少一个字段。更糟的是第 5 层的色值正则 `/^#[0-9a-f]{3,8}$/` 比契约宽松：`#12345` 能通过宿主校验、写进文档、渲染成透明，且没有任何诊断。

## 决策

### 1. 能力面只有一份，放在 `@base-screen/contracts`

`document/canvas-background.ts` 是画布背景能力的唯一来源，公开四项：

- `SCREEN_CANVAS_FIELDS`：`update-canvas` 可写的键；`core` 直接引用，不再复写数组。
- `SCREEN_CANVAS_BACKGROUND_TYPES`：背景形态清单，**从 zod schema 派生**（`canvasBackgroundSchema.options`），不手写第二份。
- `isScreenCanvasPaletteColor` / `isScreenCanvasBackground`：色值与整值的判定，含"色标 ≥ 2、位置严格递增、角度/圆心有界"。

消费方按角色使用：`core` 引字段清单，宿主引判定（替换手写正则），设计器继续用契约类型。任何一方都不再维护"契约子集"。

### 2. 不在契约包内的一侧，用根级测试绑定

示例后端是 CJS 且刻意不依赖契约包（`agent-flow-contract.test.ts` 已确立这一范式），因此它必须保留一份同形定义。缺的从来不是同一份代码，而是**绑定**：

`tests/examples/canvas-background-parity.test.ts` 按 `SCREEN_CANVAS_BACKGROUND_TYPES` 逐类型断言：

- 模型看到的工具 schema enum 与契约清单逐项相等；
- 每种形态都有一句中文能被后端规则解析成**契约接受**的值；
- 该值经宿主编译、`core` 应用后真的落在 `document.canvas.background` 上；
- 已成事实时两端都判定"无变更"（而不是提交空提案）；
- 契约拒绝的值，宿主编译给出 `invalid` 而不是"已经是这样了"。

样本表以 `Record<ScreenCanvasBackgroundType, …>` 收键：契约新增形态时缺键即编译失败，逼着补齐"智能体怎么说得出它"。契约包内另有一份同类测试（`packages/contracts/tests/document/canvas-background.test.ts`），锁 schema 与类型清单的派生关系。

### 3. 纯色与渐变互相切换时，两个字段一起写

渲染层渐变优先于 `backgroundColor`。只写 `backgroundColor` 会让旧渐变继续盖住新颜色（用户视角是"改了没反应"）；只写 `background` 会让 `backgroundColor` 停在旧值（契约要求它始终存在）。因此：改纯色时 `background` 与 `backgroundColor` 同时落成 solid，改渐变时只动 `background`。设计器调色板与宿主编译遵循同一规则。

### 4. 编译结果区分"不合法"与"没变化"

`compileCanvasCommands` 返回 `{ ok: true, commands } | { ok: false, problem: 'invalid' | 'unchanged' }`。两者都不可提交，但把非法取值说成"画布已经是你说的样子"会让人以为功能坏了。

## 影响

- 契约公共面新增四项（`patch` 级 changeset），`core` 的 `CANVAS_FIELDS` 改为引用契约清单。
- 智能体可以零模型执行"改成渐变"类指令：后端规则直接产出 `background`，工具 schema 与提示词同步声明三种形态，不再出现"让用户改给图片 URL"的降级建议。
- 三个宿主的画布编译器不再丢弃 `background`，也不再接受 `#12345` 这类渲染不出来的色值。
- 未改动渲染层与设计器代码：它们本来就是正确的，只是被上游的清单副本挡住了。

## 替代方案

- **让后端依赖契约包**：更彻底，但需要把 `examples/shared-backend` 从 CJS 迁到 ESM（NestJS + Prisma + ts-jest 全链路），收益不足以抵消风险。
- **在宿主侧放开校验、只靠 `core` 拒绝**：少一份副本，但非法取值会变成"提案被引擎拒绝"的黑箱提示，且"无变更"与"非法"仍然无法区分。
- **为渐变单独加一条命令**：与 `update-canvas` 的 patch 语义重复，且会引入第二套背景类型。
