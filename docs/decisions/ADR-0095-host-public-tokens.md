# ADR-0095：宿主公共令牌层（`--bs-host-*`）

> 状态：已接受
> 日期：2026-11-05
> 关联：ADR-0062（宿主左侧分组）、ADR-0089（宿主自有图片资产）、ADR-0091（事件蓝图工作台边界）。

## 背景

宿主可以把内容渲染进设计器的命名 slot（左栏 `leftPanelGroups`、蓝图画布），但拿不到任何设计令牌：

- `packages/engine/src/browser/styles/designer-tokens.css` 经 `?inline` 拼进 `DESIGNER_CSS` 注入 shadow root；
- `engine` / `sdk` / `react` / `vue` 的 `exports` 只有 JS 入口，`files: ["dist"]` 里也没有 CSS 产物；
- 唯一公共通道是 `--base-screen-designer-*` 覆盖位，方向是「宿主改引擎」，不是「宿主读引擎」。

后果是每个宿主自抄一份调色板。三个示例宿主的 `asset-library.css` 顶部逐字相同（md5 一致），
且只有深色值：设计器顶栏切到 `theme="light"` 后工作台整体变浅，只有宿主左栏还是黑的。这不是
某一处写错，而是缺少发布面导致的结构性漂移——第二个宿主团队会立刻复制出第二份。

`designer-styles.mjs` 的 `publicTokens`（39 项）守的是「覆盖位映射完整」，与「宿主能读什么值」是两套契约，
不能合并。

## 决策

### 1. 发布烘焙值的公共令牌层，不复用内部命名

新增 `@base-screen/engine/host-tokens.css` 与 `@base-screen/sdk/host-tokens.css`（同内容，sdk 是宿主入口）。
公共前缀 `--bs-host-*`，只导出宿主画面板真正需要的一层：33 个主题令牌（双主题成对）+ 50 个几何/排版令牌。
其中图墙卡片几何（`--bs-host-card-min-width` / `-gap` / `-thumb-aspect`）与引擎物料卡同源，
宿主素材卡因此和物料卡同宽、同比例。

不导出：画布 grid / 测量 / snap guide（引擎编辑 affordance）、`elev-card` / `shadow-canvas`（画布卡片专用栈）、
表单控件内部几何（`switch-*`、`checkbox-size`、`segmented-*`）——宿主应使用自己的组件库，公共层不复制控件实现。

### 2. 单一真源 + 生成物提交 + 重生成比对

值只从 `designer-tokens.css` 读取，`tooling/build/host-tokens.mjs` 负责两件改写：

- **解包覆盖位**：`var(--base-screen-designer-x, 兜底)` 只取兜底值，公共层要烘焙值而不是引擎的覆盖钩子；
- **重映射内部标识符**：值里的 `var(--designer-x)` 改写成 `var(--bs-host-<公共名>)`。`elev-ring`、
  `scrollbar-thumb`、`action-primary` 的值本身就是内部令牌派生，直接拷贝会把内部命名漏进公共层，
  并在宿主页面（没有引擎 shadow 作用域）解析失败。

生成物提交仓库；`pnpm check:host-tokens` 断言重新生成逐字节一致。公共名删除/改名必须显式改
`tooling/checks/host-tokens.mjs` 的名字快照——只做「重生成无 diff」时，删令牌会静默通过。

### 3. 作用域零特异性，主题两个来源

```css
:where(.bs-host) { color-scheme: dark; /* … */ }
:where(.bs-host[theme="light"], base-screen-designer[theme="light"] .bs-host) { color-scheme: light; /* … */ }
```

公共层只声明自定义属性 + `color-scheme`。`color-scheme` 是必需的：插槽内容在 light DOM，
不声明时宿主面板里的原生滚动条、搜索框清除钮仍是深色外观。`:where()` 保证宿主任何类选择器都能覆盖单个令牌。

宿主页面自身主题（如 `html[data-theme="light"]`）不在公共层猜测，由宿主写覆盖；选择器在 `body` 上的
对话框需要自己镜像 `theme` 属性（示例实现见 `asset-library.ts` 的 `openPicker`）。

### 4. 兼容规则

- **名字 = 契约**：删除或改名属破坏性变更；新增是小版本。
- **值 = 视觉调优**：值可随 minor 演进；硬约束是双主题成对存在，且配色仍满足引擎既有对比度契约
  （语义色与其低强调 surface ≥ 3:1，正文文字压面板底 ≥ 4.5:1）。
- 公共层不新增间距/字号档位，也不引入 44px 触控目标：工作台内建控件是 30/28px，单方面抬高会让
  宿主面板比相邻内建面板更松，反而破坏一致性。

## 后果

- 宿主不再复制调色板：三端示例改为 `import '@base-screen/sdk/host-tokens.css'` + 局部变量别名，
  浅色主题自动跟随。
- 引擎内部令牌可以继续自由演进；改源令牌名会让 `HOST_TOKENS_SOURCE_UNKNOWN` 在引擎侧先红，
  不允许静默改名。
- 多一个构建步骤与一条门禁（`check:host-tokens` 进 `verify:fast` / `verify:m0`）；engine/sdk 的
  `exports` 各多一个 CSS 子路径，`verify:tarball` 的 publint 会校验产物存在。
- 未采用「让宿主直接读 `--designer-*`」：技术上能沿 flat tree 继承到 slot，但那是内部命名、
  没有版本化，等于把引擎内部实现变成事实上的公共 API。
