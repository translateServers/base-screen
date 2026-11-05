# 宿主公共令牌层（方案 B）设计

> 状态：设计待评审 · 影响面：`packages/engine` 导出面、`examples/*` 样式、`tooling/checks` 门禁
> 前置讨论：左侧 `leftPanelGroups` 自定义插槽的视觉一致性；方案 A（examples 内共享副本）只解决本仓库，
> 换第二个宿主团队立刻复发，故作废。

## 1. 问题

宿主在自己的左栏 slot 里画 UI 时，没有任何可消费的设计令牌：

- 令牌定义在 `packages/engine/src/browser/styles/designer-tokens.css`，经 `?inline` 拼进 `DESIGNER_CSS`
  注入 shadow root，宿主取不到。
- `@base-screen/engine` 的 `exports` 只有 `.`；`sdk` / `react` / `vue` 同样只有 JS 入口。`files: ["dist"]`
  里没有任何 CSS 产物。**当前没有任何公共样式发布面。**
- 唯一公共通道是 `--base-screen-designer-*` 覆盖位（写方向）。宿主改引擎颜色可以，反向取色不行。
- 结果是每个宿主把自己的 `#0f0f0f` / `rgb(245 245 245 / 15%)` 抄一份。`examples/*/src/styles/asset-library.css`
  顶部 35 行就是这份副本，三端逐字相同（md5 一致），且**只有深色一份**——设计器切到 `theme="light"`
  后整个工作台变浅，只有宿主左栏还是黑的。

## 2. 决策

1. 发布一份**烘焙值**的公共令牌样式表 `@base-screen/engine/host-tokens.css`，公共命名统一前缀 `--bs-host-`。
2. 它**不是**第二份真源：内容由 `designer-tokens.css` 派生成，生成物提交仓库，CI 用「重新生成必须无 diff」守漂移。
3. 只导出宿主画面板真正需要的一层语义令牌（33 个双主题 + 50 个几何/排版，共 83 个），不镜像引擎全部令牌；
   引擎内部命名（`--designer-*`）继续自由演进，契约边界在公共名这一层。

## 3. 三层模型

| 层 | 归属 | 命名 | 演进自由度 | 谁消费 |
| --- | --- | --- | --- | --- |
| 引擎内部 chrome | base-screen 独占 | `--designer-*` | 自由，不受公共契约约束 | shadow 内样式 |
| 公共宿主层 | base-screen 发布 | `--bs-host-*` | 名字是契约；值随视觉调优演进而变 | 宿主面板、宿主对话框 |
| 宿主组件局部 | 宿主 | 宿主自定（`--asset-*` 等） | 宿主自由 | 宿主自身 |

宿主只做「局部变量 → 公共令牌」的别名，不复制字面量：

```css
.asset-library {
  --asset-surface-raised: var(--bs-host-surface-raised);
  --asset-border-default: var(--bs-host-border-default);
  --asset-text-muted: var(--bs-host-text-muted);
}
```

## 4. 公共令牌清单

### 4.1 语义配色（双主题成对，必填）

| 公共名 | 源令牌 | 深色（默认） | 浅色（`theme="light"`） |
| --- | --- | --- | --- |
| `--bs-host-surface-workspace` | `surface-workspace` | `#1e1e1e` | `#f4f4f4` |
| `--bs-host-surface-panel` | `surface-panel` | `#0f0f0f` | `#fcfcfc` |
| `--bs-host-surface-raised` | `surface-raised` | `#080808` | `#ffffff` |
| `--bs-host-surface-control` | `surface-control` | `#161616` | `#f7f7f7` |
| `--bs-host-surface-control-hover` | `surface-control-hover` | `#2a2a2a` | `#ececec` |
| `--bs-host-surface-control-active` | `surface-control-active` | `#323232` | `#e7e7e7` |
| `--bs-host-surface-overlay` | `surface-overlay` | `#262626` | `#ffffff` |
| `--bs-host-surface-canvas` | `surface-canvas` | `#282828` | `#efefef` |
| `--bs-host-surface-scrim` | `surface-scrim` | `rgb(0 0 0 / 70%)` | `rgb(23 23 23 / 45%)` |
| `--bs-host-text-primary` | `text-primary` | `#f5f5f5` | `#171717` |
| `--bs-host-text-secondary` | `text-secondary` | `#b7b7b7` | `#4d4d4d` |
| `--bs-host-text-muted` | `text-muted` | `#aeaeae` | `#666666` |
| `--bs-host-text-disabled` | `text-disabled` | `#7d7d7d` | `#808080` |
| `--bs-host-text-on-accent` | `text-on-accent` | `#1c2b40` | `#ffffff` |
| `--bs-host-border-subtle` | `border-subtle` | `rgb(245 245 245 / 10%)` | `rgb(23 23 23 / 10%)` |
| `--bs-host-border-default` | `border-default` | `rgb(245 245 245 / 15%)` | `rgb(23 23 23 / 15%)` |
| `--bs-host-border-strong` | `border-strong` | `rgb(245 245 245 / 16%)` | `rgb(23 23 23 / 16%)` |
| `--bs-host-accent` | `accent` | `#5297fc` | `#0070f3` |
| `--bs-host-accent-surface` | `accent-surface` | `#161d27` | `#e3eefb` |
| `--bs-host-accent-text` | `accent-text` | `#609ffc` | `#145ec2` |
| `--bs-host-focus-ring` | `focus-ring` | `#5297fc` | `#0070f3` |
| `--bs-host-elev-ring` | `elev-ring` | `0 0 0 1px rgb(245 245 245 / 15%)` | `0 0 0 1px rgb(0 0 0 / 8%)` |
| `--bs-host-shadow-overlay` | `shadow-overlay` | `0 12px 32px -12px rgb(0 0 0 / 78%)` | `0 12px 32px -12px rgb(23 23 23 / 10%)` |
| `--bs-host-shadow-float` | `shadow-float` | `0 6px 16px -8px rgb(0 0 0 / 70%)` | `0 6px 16px -8px rgb(23 23 23 / 8%)` |
| `--bs-host-success` / `-surface` | `success` / `success-surface` | `#4fcb6f` / `#17261b` | `#1d9746` / `#e1f0e6` |
| `--bs-host-warning` / `-surface` | `warning` / `warning-surface` | `#e6b221` / `#292311` | `#a48025` / `#f1ede2` |
| `--bs-host-danger` / `-surface` / `-text` | `danger` / `danger-surface` / `danger-text` | `#fc675c` / `#2b1a18` / `#fd7469` | `#dc2626` / `#f8e2e2` / `#b52a26` |
| `--bs-host-action-primary` / `-hover` / `-active` | `button-primary-*`（改名收敛） | `var(--bs-host-accent)` / `color-mix(in oklab, var(--bs-host-accent), white 14%)` / `… white 20%)` | `color-mix(in srgb, var(--bs-host-accent) 82%, black)` / `86%` / `76%` |
| `--bs-host-scrollbar-thumb` / `-hover` / `-track` | `scrollbar-*` | 前两项指向 `var(--bs-host-border-strong)` / `var(--bs-host-text-muted)`，`-track` 为 `transparent` | 同左 |

`action-primary-*` 是唯一改名的配色组：引擎里它叫 `button-primary-*`，属于控制层构件，公共层按「主操作」语义重命名。
值保持引擎配方（深色悬停提亮、浅色悬停压深），但不承诺与引擎按钮逐像素相同——宿主按钮的自有圆角/内边距由宿主决定。

### 4.2 几何与排版（单值，与主题无关）

来自 `designer-tokens.css` 裸 `:host` 块。**这些源令牌没有 `--base-screen-designer-*` 覆盖位**，
文件头已明确「不提供密度覆盖」，公共层也不提供覆盖位，只提供读取。

| 公共名 | 值 | 用途 |
| --- | --- | --- |
| `--bs-host-space-1…8` | 2 / 4 / 6 / 8 / 12 / 16 / 24 / 32px | 唯一允许的间距阶梯 |
| `--bs-host-radius-1…5` / `-pill` | 2 / 4 / 6 / 8 / 12px / 999px | 卡片、缩略图、胶囊 |
| `--bs-host-radius-control` / `-overlay` | 6px / 8px | 控件与浮层 |
| `--bs-host-control-height` / `-compact` | 30px / 28px | 输入、按钮 |
| `--bs-host-control-padding-inline` | 9px | 输入内边距 |
| `--bs-host-icon-size` / `-xs` / `-sm` / `-lg` | 16 / 12 / 14 / 18px | 图标 |
| `--bs-host-row-height` / `-comfortable` / `-compact` | 40 / 44 / 32px | 列表行、面板列头 |
| `--bs-host-column-header-height` | 40px | 与左栏列头对齐 |
| `--bs-host-card-min-width` | 112px | 图墙卡片宽度下限；与物料卡同宽 |
| `--bs-host-card-gap` | 12px | 卡片间距（= `space-5`） |
| `--bs-host-card-thumb-aspect` | `16 / 10` | 卡片缩略图比例；与物料卡同比例 |
| `--bs-host-font-family` / `-mono` | Geist 优先 | 字体族 |
| `--bs-host-font-base` / `-small` / `-numeric` | `13px/1.5` / `12px/1.4` / `500 12px/1` | 复合 font 简写 |
| `--bs-host-font-size-xs…xl` | 11 / 12 / 13 / 14 / 15 / 18px | 需要单值时用 |
| `--bs-host-tracking-ui` / `-base` | `-0.01em` / `normal` | 字距 |
| `--bs-host-motion` / `-emphasis` | `150ms` / `200ms` `cubic-bezier(0.2, 0, 0, 1)` | 过渡 |

### 4.3 明确不导出

`canvas-grid-line`、`range-track`、`elev-card`、`shadow-canvas`、`z-*`、`ruler-size`、
`switch-*` / `checkbox-size` / `segmented-*`、`empty-icon-size`、`tracking-display` / `-heading`、
`snap-guide` / `measurement-label`、`canvas-*`。

（`surface-scrim` 曾计划排除，但宿主对话框遮罩必须与设计器模态同档：宿主自写 `rgb(0 0 0 / 70%)`
在浅色主题下明显更重，故纳入。）

理由分三类：画布/测量是引擎编辑 affordance；表单控件内部几何属于控制层构件，宿主应使用自己的组件库；
`elev-card` 与 `shadow-canvas` 是画布卡片专用栈，面板用 `elev-ring` + `shadow-float` 即可。

## 5. 交付形态

### 5.1 文件与导出

```text
packages/engine/src/browser/styles/host/host-tokens.css   # 生成物，提交
packages/engine/dist/host-tokens.css                      # 构建时从 src 复制
```

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./host-tokens.css": "./dist/host-tokens.css"
  }
}
```

`files: ["dist"]` 已覆盖，无需改动。`verify:tarball` 的 publint 会检查子路径对应文件是否存在，dist 漏复制会直接失败——这是免费的产物门禁。

### 5.2 作用域与主题锚点

公共样式表必须能同时服务「设计器 slot 内」和「设计器外的宿主页面（选图对话框、素材后台页）」，
所以不绑定具体标签，只认一个根类 + 两个主题来源：

```css
/* 公共令牌层：仅声明自定义属性，不写任何组件样式、不改任何元素的现有表现。 */
:where(.bs-host) {
  --bs-host-surface-panel: #0f0f0f;
  /* …4.1 / 4.2 全量深色与单值令牌… */
  color-scheme: dark;
}

:where(.bs-host[theme="light"], base-screen-designer[theme="light"] .bs-host) {
  --bs-host-surface-panel: #fcfcfc;
  /* …浅色同名覆盖… */
  color-scheme: light;
}
```

三条约束：

1. **`color-scheme` 只声明不继承**：插槽内容在 light DOM，若不声明，宿主面板里的原生滚动条、搜索框清除钮、
   日期控件仍是深色外观，与面板底色打架。这与引擎内部（两个主题块末尾各自声明）做法一致。
2. **`:where()` 保证零特异性**：宿主任何一条类选择器都能覆盖单个令牌。NEVER 用 `!important`，
   也不要在公共层写任何非自定义属性声明（除了 `color-scheme`）。
3. 第二种锚点 `base-screen-designer[theme="light"] .bs-host` 只覆盖「slot 内跟随设计器主题」这一个高频场景；
   宿主页面自身主题（如 `html[data-theme="light"]`）不在公共层猜测，由宿主自己写覆盖：
   `[data-theme="light"] .bs-host { --bs-host-surface-panel: #fcfcfc; }`。

### 5.3 生成器契约

`tooling/build/host-tokens.mjs`：

```text
读取 designer-tokens.css
├─ 解析三个块：裸 :host（共享单值）、:host([theme="light"])、:host, :host([theme="dark"])
├─ 按 HOST_TOKEN_MAP（公共名 → 源令牌名）取值
├─ 标识符重映射：值里的 var(--designer-X) → var(--bs-host-X)（X 在公共层则重映射，否则报错）
├─ 断言：不得残留 --designer- / --base-screen-designer- 字面量
└─ 输出 host/host-tokens.css（固定头注释 + 固定声明顺序，保证重新生成字节级稳定）
```

清单常量 `HOST_TOKEN_MAP` 与公共名快照 `HOST_TOKEN_NAMES` 放在检查脚本里（见 6），生成器 import 同一份，
保证「生成什么」与「校验什么」不可能分叉。

重映射是必需的，不是优化：`elev-ring`、`scrollbar-thumb`、`elev-card` 这类值本身是 `var(--designer-*)` 派生，
直接文本拷贝会把内部命名漏进公共层，也会在宿主页面（没有引擎 shadow 令牌）里解析失败。

## 6. 门禁与兼容契约

现有 `tooling/checks/designer-styles.mjs` 的 `publicTokens` 白名单（39 项）是「覆盖位映射完整性」契约，
语义不同：那一份约束的是**宿主能否改引擎颜色**，这一份约束的是**宿主能读什么值**。两份都必须保留。

新增 `tooling/checks/host-tokens.mjs`，错误码与守的东西一一对应：

| 断言 | 守什么 |
| --- | --- |
| `HOST_TOKENS_STALE` | 重新生成与仓库内文件逐字节一致（唯一真源不漂移） |
| `HOST_TOKENS_SOURCE_UNKNOWN` | `HOST_TOKEN_MAP` 里的源令牌必须在 `designer-tokens.css` 存在（引擎改名必须先改清单） |
| `HOST_TOKENS_INTERNAL_LEAK` | 生成物里不得出现 `--designer-` / `--base-screen-designer-` |
| `HOST_TOKENS_THEME_PAIR_MISSING` | 每个配色公共令牌必须在浅/深两个选择器块里都声明 |
| `HOST_TOKENS_NAMES_DRIFT` | 生成物的公共名集合必须与 `HOST_TOKEN_NAMES` 快照完全相等 |

最后一条是名字兼容的兜底：只做「重新生成无 diff」的话，删一个公共令牌只要重新生成就静默通过；
名字快照要求删除/改名必须显式改快照，在 PR diff 里可见。取这条而不把名字塞进 `.d.ts`，是因为
`pnpm check:api` 只看类型声明，为一组 CSS 变量名引入运行时导出常量会额外扩大 API 面并触发 changeset 流程，
收益不匹配。

接线：根 `package.json` 增加 `check:host-tokens`，并加入 `verify:fast` 与 `verify:m0`（不加入的话没人跑）；
engine 的 `build` 末尾追加复制步骤，`lint` 不重复跑生成（生成只做 `--check`）。

兼容规则（写进 ADR）：

- **名字 = 契约**：公共名删除或改名属于破坏性变更；新增是小版本。
- **值 = 视觉调优**：值可随 minor 变化；唯一的硬约束是双主题成对存在、且配色对比度仍满足引擎既有契约
  （语义色与其低强调 surface ≥ 3:1；正文文字压面板底 ≥ 4.5:1，即 `tests/browser/styles` 的 R2 口径）。
- 公共层不引入新字号/新间距：只能取 4.2 的既有档位。宿主需要更密或更松，由宿主自己缩放，不扩公共阶梯。

## 7. 宿主使用规范

1. 面板根节点加 `class="bs-host"`，且**不写背景色**（`.host-left-panel-view` 已刷成面板表面色；再铺一层会同时
   破坏主题跟随与 `--base-screen-designer-*` 覆盖位）。
2. 只允许「组件局部变量 = 公共令牌」的别名，样式里不出现 `#hex` / `rgb()` 字面量。
3. 根节点 `height:100%; min-height:0; flex column`，滚动只发生在内容楼层
   （`overflow:auto; scrollbar-gutter:stable; overscroll-behavior:contain`），滚动条颜色取 `--bs-host-scrollbar-*`。
4. 间距、圆角、控件高、字号只能取 4.2 的档位；选中态用中性灰块 + 1px 收边，强调色只给主操作、焦点环、当前位置。
5. 焦点环 `outline: 2px solid var(--bs-host-focus-ring); outline-offset: -2px`；`@media (prefers-reduced-motion: reduce)`
   下把过渡压到 0。

```css
.asset-library {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: var(--bs-host-space-4);
  color: var(--bs-host-text-primary);
  font: var(--bs-host-font-base);
}

.asset-library .asset-card {
  border-radius: var(--bs-host-radius-3);
  background: var(--bs-host-surface-raised);
  box-shadow: var(--bs-host-elev-ring);
}

.asset-library .asset-card:hover {
  background: var(--bs-host-surface-control-hover);
}

.asset-library .asset-card:focus-visible {
  outline: 2px solid var(--bs-host-focus-ring);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .asset-library * {
    transition: none !important;
  }
}
```

`--bs-host-` 前缀留给公共层，宿主局部变量用自己的命名空间（示例里的 `--asset-*`），避免与将来新增的公共名撞车。

## 8. 迁移清单（S1–S4 已落地）

| 阶段 | 动作 | 验收 | 状态 |
| --- | --- | --- | --- |
| S1 生成 | `tooling/build/host-tokens.mjs` + `host/host-tokens.css`（生成物提交）；engine build 末尾 `--emit` 复制到 dist | `--check` 通过；`dist/host-tokens.css` 与源生成物字节一致 | 完成 |
| S2 门禁 | `tooling/checks/host-tokens.mjs`，接 `check:host-tokens` → `verify:fast` / `verify:m0`；engine 与 sdk 的 `exports` 各加一条 CSS 子路径 | 改一个源值触发 `HOST_TOKENS_STALE`；删快照一项触发 `HOST_TOKENS_NAMES_DRIFT`；两个包 `publint` 通过 | 完成 |
| S3 消费 | 三端 `asset-library.css` 顶部本地令牌块改为 `--bs-host-*` 别名，令牌层由入口 `main` 统一引入；左栏与选图对话框加 `bs-host` 类，对话框打开时镜像 `theme` | 构建产物含全部公共令牌与浅色选择器；三端 CSS/TS 逐字一致 | 完成 |
| S4 断言 | harness 新增 `assertHostPublicTokens`：公共层与引擎逐项等比（深/浅）+ `color-scheme` + 浅色确实换值 + DOM 锚点关系；`system.html` 样例 | `pnpm verify:browser` 通过 | 断言完成；样例未做 |

S4 的 `system.html` 样例未做的原因：该页整块挂在设计器 shadow root 内，而公共层的浅色锚点
`base-screen-designer[theme="light"] .bs-host` 要求 `.bs-host` 是 light DOM 后代，shadow 内放样例
只会看到默认深色一套，反而误导评审。真实样例以三端宿主的左栏与选图对话框为准。

S3 的三端文件保持逐字一致（迁移前后都用 md5 校验），与 `asset-library.ts` 的既有约定一致。

## 9. 风险与未决

| 风险 | 处置 |
| --- | --- |
| 公共层膨胀成「第二套引擎令牌」 | 用「宿主能画什么」倒推清单（4.3 的排除项就是边界）；新增公共名必须说明宿主场景 |
| 宿主锁旧版 SDK，CSS 与引擎 JS 不同步 | 生成物头注释写入包版本；文档明确「公共层只保证与同版本引擎一致」 |
| 值随视觉调优变化导致宿主截图回归 | 值变化走 minor + changeset 说明；不承诺像素级稳定 |
| 引擎改源令牌名 → 宿主全量失效 | `HOST_TOKENS_SOURCE_UNKNOWN` 在引擎侧就失败，不允许静默改名 |
| 生成物被手工编辑 | `HOST_TOKENS_STALE` + 头注释「由 tooling/build/host-tokens.mjs 生成，勿手改」 |

未决：公共层是否需要给 `focus-ring` 之外的键盘可达性辅助（如 `--bs-host-target-min: 44px`）。当前不引入，
因为工作台内建控件的可点击区已低于 44px（30px 控件 + 行高），单方面提高会让宿主面板比引擎面板更松，
反而破坏一致性。这条需要在 ADR 里明确「公共层跟随工作台密度，不单独抬高触控目标」。

## 10. 验收口径

- 设计器在 `theme="light"` 与默认深色下，宿主左栏与相邻内建面板的 `background-color`、`color` 完全相等。
- 三端宿主样式表的颜色一律取公共令牌（唯一例外：620px 高对话框的自有大尺寸阴影，已在文件内注明原因）。
- 引擎删一个公共令牌 → `HOST_TOKENS_NAMES_DRIFT` 失败；引擎改一个源值 → `HOST_TOKENS_STALE` 失败。
- 宿主面板内容在 200–480px 宽度区间内 `scrollbar-gutter` 稳定，不出现横向滚动与列闪烁。
