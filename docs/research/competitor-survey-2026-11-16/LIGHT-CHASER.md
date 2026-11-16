# LIGHT CHASER 全解

> 2026-11-16
> 对象：lcdesigner.cn（线上版本）
> 方法：UI 实测 + 线上 bundle 字符串分析
> 许可：DataVisool License 1.0（非 OSI 开源许可证，个人/教育/非营利/组织内部免费，第三方分发与商业用途需书面授权）
> 注：本文仅以线上实拍与线上页面产物为依据，不引用任何开源仓库或本地源码。
> 证据等级：`[实拍]` `[DOM]` `[代码]` `[单次]` `[推测]`

---

## 1. 产品定位

| 项 | 内容 |
|---|---|
| 定位 | C 端数据可视化设计器，DataVisool License 授权（非 OSI 开源），商业用途需书面授权 |
| 前端栈 | React 18 + Vite 5 + TypeScript 5 |
| 图表引擎 | AntV G2Plot（28 种）+ ECharts + MapLibre + 高德 + Three.js |
| 画布默认 | 1920×1080，缩放 65% |
| 组件总数 | **55 种** `[代码]` |

站点的性格建立在**默认状态**上：打开时两侧只有 46px 图标条，**画布占 ~95%**。所有面板都是浮层，点开覆盖画布，关掉消失。

---

## 2. 编辑器界面

### 2.1 顶栏（14 个按钮）

| 按钮 | 快捷键 | 说明 |
|---|---|---|
| 返回首页 / 选择工具 / 抓手 | `V` / `H` | — |
| 打开组件库 | — | — |
| 添加文本 / 添加色块 | `T` | 直接加基础组件 |
| **新建循环容器** | — | 一等公民组件 |
| **打开蓝图编辑器** | — | 全屏切换 |
| **画布设置** | — | 尺寸/适配/框选/栅格 |
| **主题设置** | — | 项目级换肤 |
| **全局滤镜** | — | 画布级 CSS filter |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` | — |
| 快捷键帮助 | — | — |
| 保存状态 | — | **带时间戳**「已保存 11:13:17」 |
| 预览 / 发布 / ⋯ | — | — |

### 2.2 左侧 7 个入口

| 面板 | 内容 | 空状态文案 |
|---|---|---|
| 组件库 | 「所有」+ 8 个分类 + 搜索 `⌘F` | 「无匹配组件」 |
| 资源库 | 图片 / 视频，单列大图 | — |
| 图层列表 | 行内三图标：编辑/显隐/锁定 | — |
| 模板库 | 用户自存模板 | 「选中画布中的组件，右键选择「存为模板」」 |
| 全局变量 | 变量列表 | 「新建变量后可在组件和蓝图中复用」 |
| 子项目 | 主项目 + 子项目（多画布） | 「新建子项目，独立编辑和切换画布」 |
| AI 驱动 | 模型 + 需求输入 | 「统一整合模型选择、提示输入与图片辅助」 |

**四个空状态，四个都讲用途**，没有一个是「暂无数据」。

**组件库分类** `[实测]`：「所有」之外共 8 个分类——图表（28 种）/ 信息（4）/ 地图（2）/ 装饰（2）/ 模型（空）/ 媒体（5，含 3D 模型）/ web元素（10）/ 其他（3）。**没有「时间」分类**。

### 2.3 右侧属性面板 `[实拍]`

```
[基础]  [样式]  [数据]  [映射]  [滤镜]  [主题]
```

**tab 数量取决于组件类型**：图表类（面积图）为 6 个，含「映射」；数字翻牌器为 5 个，没有「映射」。

| tab | 内容 |
|---|---|
| 基础 | 名称 / 宽高 / X/Y / 6 向对齐 / **3 轴旋转 / 透视 / 双轴倾斜 / 原点 / 重置变形**（13 字段）`[实拍]` |
| 样式 | 组件特有，三级折叠（见 §4） |
| 数据 | 数据源下拉 + 数据编辑器 + 过滤器（见 §6） |
| 映射 | X 字段 / Y 字段两个下拉，选项自动取自数据 |
| 滤镜 | 7 参数（enable/blur/brightness/contrast/opacity/saturate/hueRotate） `[代码]` |
| 主题 | 组件级主题预设（仅作用于当前组件）：「主题预设」下拉 + 「自定义主题」入口；预设为科技风格(默认主题) / 烈焰战区 / 复古工业 / 数字森林 / 星际远航 / 未来主义 / 核能核心 `[实拍]` |

**「基础」和「样式」分开**是它的关键划分：通用属性不会和图表参数混在一起。

### 2.4 画布与交互

- 标尺：上 0–1700+，左 -100–900，间距 20px 点阵网格
- 三个开关：允许触发组件原生事件 / 开启排版吸附 / 显示标尺
- 右下角面包屑：「项目 › 主项目 › 图层 0」（文件系统心智）
- 底部 `</>`：**以代码编辑组件配置**

**单击只选中，双击才打开属性面板** `[实拍]`。好处是选中后能直接拖拽不被面板挡；代价是发现成本高。

**没有浮动工具栏**，所有操作走右键菜单。

### 2.5 右键菜单（12 项）

```
选择图层 ›           ← 重叠时选哪个
克隆        Ctrl+D
复制        Ctrl+C
上移/下移    Alt+↑/↓
置顶/置底    Ctrl+↑/↓
删除        Delete     （红）
隐藏        Ctrl+H
存为模板
清理空分组
锁定        Ctrl+L
打开 DevTools
```

**层级操作平铺 4 项**——比 GoViewPro 收进子菜单好，大屏里前后遮挡是高频场景。

### 2.6 画布设置

```
宽度 1920 / 高度 1080
屏幕适配 [自适应 (Scale) ▾]
☑ 完整框选 (Contain)   —— 框选必须完整包住元素才选中
☑ 栅格化 (Rasterize)   —— 拖拽缩放按步长吸附
```

**「完整框选」默认开启**。快捷键注册表 `[代码]`：

```
BOX_SELECTION_START   = 从元素上开始框选   ← KeyX, hold
BOX_SELECTION_CONTAIN = 临时完整包含框选   ← Alt
AXIS_LOCK             = 拖拽锁轴          ← Shift
```

**「从元素上开始框选」是关键设计**：默认在元素上拖是移动它，想从元素上起框必须按 X。避免"想框选却拖动了组件"。

**实现三个模块** `[代码]`：`selectionBoxController` / `selectionResolver` / `selectionSpatialIndex`。

**空间索引**值得注意——它没有遍历所有组件判断相交，而是用了空间索引。上百组件时把 O(n) 降到 O(log n)。

### 2.7 主题预设（全局 与 组件级 两层）

**全局层（顶部「主题设置」按钮，`button[title="主题设置"]`，位于画布工具栏）`[DOM + 实拍]`**
- 点击后挂载「画布主题设置」对话框（`.lc-dialog-wrapper`），**不是浮层**，所以 fixed/absolute 筛选无法命中，要用 MutationObserver 或按文本查找。
- 标题「画布主题设置」，说明「选择预设或自定义主题，统一当前项目组件的视觉风格」。
- 主题预设：同样 7 套（科技风格(默认主题) / 烈焰战区 / 复古工业 / 数字森林 / 星际远航 / 未来主义 / 核能核心）。
- 「效果预览」：一个示例仪表（数据概览 24,680 / 1,286 / 98.6%，访问趋势、来源分布）。
- 当前色值（科技风格）：主体色 `#00DFFF`、主文字 `#62EDFF`、副文字 `#4CA4B1`、背景色 `#00DFFF33`、辅助色1 `#38929F`、辅助色2 `#1790A2`。
- 按钮：**取消 / 自定义主题 / 更新全局主题**。文案「更新后将影响当前项目的所有组件」。
- 说明：全局对话框截图未能拍到画面（截图时对话框已不在前台），本节以 DOM 读取为准。

**组件级层（属性面板「主题」tab）`[实拍 + DOM]`**
- 「主题预设」下拉 + 「自定义主题」入口；预设与全局层**同名同色**，但文案明确"仅应用于当前组件"。
- 每个预设 6 色块，色值读取如下（`title` 属性，名称与色值一一对应）：

| 预设 | 6 色（按顺序） |
|---|---|
| 科技风格(默认主题) | #00dfff, #62edff, #4ca4b1, #00dfff33, #38929f, #1790a2 |
| 烈焰战区 | #FF5500, #FFFFFF, #B34A1E, #1A1412, #33221B, #4D2D22 |
| 复古工业 | #FFC107, #FDF5E6, #B39547, #2B2620, #423A2F, #594E3F |
| 数字森林 | #00FF41, #D0FFD0, #4E9A5E, #0A1A0F, #14331E, #1E4D2D |
| 星际远航 | #AEE9FF, #E6F7FF, #8BB9D9, #1B2429, #2B3A42, #3D525C |
| 未来主义 | #1677FF, #FFFFFF, #A6C5F7, #24292F, #37414B, #4B5966 |
| 核能核心 | #722ED1, #F9F0FF, #B391D9, #121226, #23234D, #343473 |

- 「自定义主题」按钮（`.btn-create-theme`）：**真实 click 才触发**，挂载「编辑主题」对话框（`.lc-dialog-wrapper`）：
  - **主题信息**：主题名称（输入框，占位「请输入主题名称」）。
  - **颜色定义**：6 项，依次为 主体色 Primary、主文字 Main text、副文字 Sub text、背景色 Background、辅助色 1 Accent 1、辅助色 2 Accent 2。默认值 `#4fb8ff` / `#ffffff` / `#a0a0b2` / `#1e1e2f` / `#3ced92` / `#ff6e6e`。
  - **配色预览**：「未命名主题」卡片 + 文本样例。
  - **主题列表**：计数「7/20」，上限 20 个。
  - 按钮：**添加 / 更新**（未点击，是否写入线上未验证）。
- 颜色选择器 `[DOM + 实拍]`：
  - 触发：`button.lcp-color-picker-trigger`（`aria-haspopup="dialog"`）。点到外层 div 无效，必须点按钮本身。
  - 挂载 `.lcp-color-picker-panel`（浮层，z-index 2400）。
  - 内容：标题「颜色」+ 当前值；色块选取区 + 原生 `<input type="color">`；「透明度」滑块（0–100）+ 数字框。
  - **没有模式切换**，不存在渐变模式，「单色」只是标签。

**两层的关系**：全局层作用于整个项目的所有组件，组件级只覆盖当前组件。两层预设列表相同，但**组件级不改全局**（文案已说明）。

---

### 2.8 全局滤镜

6 参数：模糊(px) / 亮度(%) / 对比度(%) / 透明度(%) / 饱和度(%) / 色调(°)。标题旁标注「·未开启」。

### 2.9 错误快照恢复 `[实拍]`

项目异常后打开会弹出：

```
检测到项目异常
快照列表  10 条
○ 未命名项目1   0 分钟前
○ 未命名项目1   4 分钟前
...
```

**间隔约 3 分钟，保留 10 条 ≈ 最近半小时**。每条同时显示绝对时间（11/16 12:42）和相对时间（4 分钟前）。

---

## 3. 组件体系（55 种）`[代码]`

每个组件带 `componentInfo`：

```js
{
  componentType, componentName, description, nativeCapabilities,
  selectable, sha256, componentVersion,
  documentFormatVersion: "component-document/v1"
}
```

### 3.1 分类

| 族 | 数量 | 例子 |
|---|---|---|
| AntV 图表 | 28 | BaseBar/Column/Line/Area/Rose/Gauge/Liquid/Pie/Radar/Scatter/WordCloud/Group*/Stack*/Percent*/Range*/StepLine 等 |
| 引擎类 | 6 | ECharts、G2PlotCustom、MapLibreGis、AMap、ThreeModel、ScreenReference |
| 基础展示 | 18 | Text、Button、ColorBlock、Image、Video、Iframe、Input、Select、Tab、Switch、DateTime、DateTimePicker、DigitalFlipper、TextScroller、LcBaseTable、carousel、FlvPlayer、HlsPlayer |
| 特殊 | 3 | LoopContainer、group、FourAngleGlowBorder |

### 3.2 能力声明的写法

```
"纵向柱形、坐标轴、完整图例、数据标签、提示框、标注、滚动条"
"仪表弧线、进度色带、刻度轴、指针、数据标签、中心统计文本、提示框、标注"
"重复渲染子组件模板并控制排列轮播；不包含模板内部可见内容"
```

**格式统一**：`[视觉主体] + 坐标轴 + 完整图例 + 数据标签 + 提示框 + 标注`

**特殊组件带「不包含 XX」**：

| 组件 | 声明 |
|---|---|
| BaseColorBlock | 背景色、边框和阴影组成的色块；**不包含内部内容** |
| FourAngleGlowBorder | 四角整套辉光边框；**不包含背景和内部内容** |
| LoopContainer | 重复渲染子组件模板；**不包含模板内部可见内容** |
| group | **不产生可见结构，仅组织已有组件** |

这是告诉 AI「改它不影响内外」，防止误判作用范围。

---

## 4. 属性面板的三级结构（面积图为例）`[实拍]`

### 4.1 结构

```
样式
├─ 图形                          ← 第 1 层：视觉部件
│   ├─ 基础                      ← 第 2 层：子部件
│   │   └─ 基准填充
│   ├─ 数据点 → 尺寸/描边宽/颜色/描边色/形状
│   ├─ 数据线 → 平滑/宽度/颜色
│   ├─ 数据面 → 颜色
│   └─ 文本   → 位置/Y偏移/X偏移
├─ X轴
│   ├─ 基础 → 显示/位置/分割
│   ├─ 文本 → 角度/偏移/字号/颜色
│   ├─ 标题 → 开启
│   ├─ 轴线 → 开启
│   └─ 网格线 / 刻度线 / 子刻度
└─ Y轴（同构）
```

**第 1 层是视觉部件**（图形/X轴/Y轴），不是"属性分类"。用户按"我要改哪个部件"找。

### 4.2 完整 config（263 行）`[代码]`

```js
{
  data: [{ name: "Q1", value: 12 }, ...20 条],
  xField: "name", yField: "value",

  label: { position: "top", offsetY: -4, style: { fill: "#ffffff", fontSize: 14 } },
  supportCSSTransform: true, isStack: false, startOnZero: false,

  point: { size: 0, style: { fill: "#205e9a", stroke: "#ffffff", lineWidth: 0 } },
  line:  { color: "r(0.5,0.5,1) 0.55:#00aaff 1:#004074", size: 1.5 },
  areaStyle: { fillOpacity: 1, fill: "l(90) 0:#016eb7 0.85:#0964a133" },

  xAxis: { range: [0,1], label: {...}, line: {...},
           tickLine: null, subTickLine: null, title: null, position: "bottom" },
  yAxis: { tickCount: 3, grid: null, label: {...}, tickLine: null, ... },

  legend: { position: "right-top", layout: "vertical", itemName: {...} },
  animation: { appear: { animation: "wave-in", duration: 3000 } },
  filter: { enable: false, blur: 0, ... }
}
```

### 4.3 面板 ↔ 配置键映射

| 面板 | 配置键 |
|---|---|
| 映射 / X字段·Y字段 | `xField` / `yField` |
| 图形 / 数据点 | `point.size` / `point.style.{fill,stroke,lineWidth}` |
| 图形 / 数据线 | `line.color`（径向）/ `line.size` |
| 图形 / 数据面 | `areaStyle.fill`（线性） |
| 图形 / 文本 | `label.position` / `offsetY` / `style.*` |
| X轴 / 轴线·网格线·刻度线·子刻度·标题 | 各自的 `null ↔ object` |
| Y轴 / 基础 / 分割 | `yAxis.tickCount` |
| 图例 | `legend.*` |
| 动画 | `animation.appear.*`（组件内置，面板无入口） |
| 滤镜 | `filter.*` |

### 4.4 三条规律

**一、「开启」开关 = `null` ↔ 对象**

```js
tickLine: null                                        // 关闭
tickLine: { style: { stroke: "#fff", lineWidth: 1 } }  // 开启
```

省空间，但**从 null 切到对象要补默认样式**。

**二、面板分组 ≠ 数据结构**

`xAxis` 在代码里是**一个平铺对象**，面板把它拆成 6 个折叠组。**视图层分组，数据层扁平**——增删分组不影响文档格式。

**三、渐变用字符串语法**

```
l(90) 0:#016eb7 0.85:#0964a133        ← 线性 90°
r(0.5,0.5,1) 0.55:#00aaff 1:#004074   ← 径向
```

对 AI 不友好——模型要学这套语法。base-screen 若做渐变，用结构化对象 `{type, angle, stops}` 更好。

### 4.5 三个组件的形态差异 `[代码]`

| 组件 | config 行数 | 结构 | 字段数 | 面板 |
|---|---|---|---|---|
| 面积图 | **263** | 扁平（G2Plot） | 30+ | **三级嵌套** |
| 表格 | 133 | `style` 嵌套 | 15 | 未展开 |
| 翻牌器 | **29** | `style` 嵌套 | 12 | **全平铺** |

**属性面板的形态由字段数量决定**：12 个平铺一屏看完，30+ 必须分组。

反推阈值：**≤15 平铺，16-25 一级折叠，>25 二级折叠**。

**配置结构不统一**：图表用 G2Plot 扁平格式，基础组件用 `{style: {...}}` 嵌套。唯一一致的是 `filter` 永远在 `config` 顶层——**引擎级能力在顶层，组件级在 style 内**。

**翻牌器专有字段**：`prefix / suffix / decimalPlaces / separator / type / duration`——数字格式化做进了组件。

**表格专有**：`columns[{key,label,textAlign}]` + `body.{enableCarousel, carouselSpeed, carouselPauseSeconds, pageSize, lineBackground: [渐变1, 渐变2]}`。

---

## 5. 蓝图编辑器

### 5.1 形态

**独立全屏模式**，打开后画布消失。左侧三 tab：图层节点 / 功能节点 / 全局变量。右下有页面管理（01 / 默认页面 / 新增页面）。

### 5.2 节点类型 `[代码]` + `[实拍]`

> 下表是旧版本采集的节点，线上版本的完整节点列表未复核，不以本表数量为准。

| 节点 | 类名 | 输入 | 输出 | 配置 |
|---|---|---|---|---|
| 全局节点 | `BPGlobalNode` | 无 | 所有组件加载完成时 | 无 |
| 条件判断 | `BPConditionNode` | 判断 | 满足 / 不满足 | JS `function handler(data)` |
| 逻辑处理 | `BPLogicalProcessNode` | 执行 | 执行后 | JS `function handle(data)` |
| 显示隐藏 | `BPVisibleNode` | 切换显隐 | 无 | 绑定节点（下拉） |
| **WebSocket** | `BPWebSocketNode` | 初始化/发送数据 | 打开连接时/接收数据时/连接关闭时 | WS地址、子协议 |
| **MQTT** | `BPMqttNode` | 订阅主题/发送数据 | 打开连接时/接收数据时/连接关闭时 | 地址、端口、子路径 |
| 定时器 | `BPTimerNode` | 无 | 定时执行 | 循环 + 间隔秒（默认 5s） |
| 弹框 | `BPPopupBoxNode` | 未验证 | 未验证 | 全局单例 modal |
| 全局变量节点 | `BPGlobalVariableNode` | 未验证 | 未验证 | 未验证 |

**双向节点是核心**：WebSocket/MQTT 既能被驱动（初始化、发送），也能驱动别人（连接状态、收到数据）。**数据流可以完整建模在图里**。

### 5.3 节点配置面板（三个固定组）

```
锚点信息   ← 列出所有输入输出端口
基础配置   ← 只有一个「启用」开关
节点配置   ← 该节点特有配置
```

### 5.4 连线 `[实拍]`

- 端口：未连接空心 8px 圆，悬停蓝环，**已连接实心蓝点**
- 连线：紫色贝塞尔曲线，带拐点
- **技巧**：拖拽需密集路径（每段 20-25px），点少于 8 个会失败

---

## 6. 数据配置

点「数据」tab：

```
数据源  [静态数据 ▾]

[Plain text]          [⛶]
1  | [...]  （或标量 123456789）

[过滤器]
[JAVASCRIPT]          [⛶]
```

**5 种数据源** `[实拍]`：

| 类型 | 说明 |
|---|---|
| 静态数据 | 直接编辑 JSON 或标量 |
| 接口(API) | HTTP 请求 |
| 公共API | 引用项目级公共接口（`commonApiId`） |
| 数据库 | SQL 查询（`targetDb` + `sql`） |
| 全局变量 | 绑定变量，变量变则重渲染 |

**没有 WebSocket/MQTT**——那是蓝图节点。分层清晰：组件级拉取式 vs 项目级推送式。

**数据格式由组件类型决定** `[实拍]`：面积图/表格是对象数组，翻牌器是标量。

**没有告警规则** `[实拍]`，滚动到底确认。

---

## 7. AI 驱动 `[代码]`

### 7.1 四层任务模型

```
Thread（会话，可归档）
  └── Turn（一轮）
       └── Task（一次执行，可 cancel / resume / steer）
            └── Item（产物）
```

20 个 API：`thread/*` `turn/*` `task/*` `item/list` `attachment/upload` `settings/*` `model/providers`

`steer` 是中途改方向，`resume` 是断点续跑。

### 7.2 三个画布工具

`create_canvas_components` / `patch_canvas_components` / `delete_canvas_components`

**约束**：单次最多动 4 个组件、创建时类型 1–10 种、AI 反问 1–3 个问题。

**三个「不许猜」**：

```
commonApi.commonApiId 必须由用户选择，不能猜测
database.targetDb     必须由用户选择，不能猜测
globalVariable.gvId   必须由用户选择，不能猜测
```

### 7.3 字段级冲突检测

AI 的每个 patch 必须带 `expectedSnapshots`，应用前逐项比对，校验分四层：

| 层级 | 错误文案 |
|---|---|
| 项目 | `AI 任务所属项目已切换：期望 X，当前 Y` |
| 画布 | `AI 任务所属画布已切换：期望 X，当前 Y` |
| 组件类型 | `目标组件类型已变化：期望 X，实际 Y` |
| **字段** | `目标组件读取后以下字段已变化：{fieldPath 列表}` |

**回滚**：`组件补丁应用失败并已回滚`；失败时诚实承认 `回滚未完整成功，受影响组件：[...]`。

**删除有五道校验**（`state_unavailable` / `state_unknown` 说明读不到状态就不删）。

### 7.4 组件向 AI 描述自己的三层机制 `[代码]`

**第一层 `getAiFeatureInfo()`**：

```ts
{ summary, featureTags, applicableScenes, capabilities, constraints, aliases }
```

`constraints`（告诉 AI 别做什么）和 `aliases`（用户可能怎么称呼）最关键。

**第二层 `getAiStylePromptTs()`** —— 最聪明的设计：

```ts
`export interface ComponentStyle {
  /**
   * 是否启用无限轮播。
   * 启用后循环容器将以单向平移的方式持续轮播展示内容。
   */
  enableCarousel?: boolean;
  ...
}`
```

**组件把样式定义渲染成带注释的 TS interface 塞进 prompt**。AI 拿到的不是自然语言，是类型签名——**AI 看到的就是 schema 本身，不会编造字段名**。

**第三层 `nativeCapabilities`** —— 一句话说清边界。

### 7.5 其它

- **预算控制**：时长预算（分钟）+ 交互次数预算，超时「停止并保存进度」
- **分区提交**：「首批请求需 incremental=false 且提供 layout」
- **上下文压缩**：「接近容量上限，正在自动压缩」
- **本地状态**：`AI_DRIVEN_ACTIVE_TASK_V1` / `PENDING_TASK_V1` / `SELECTED_THREAD_V1`
- **模型**：Anthropic / DeepSeek / OpenAI / 小米 MiMo

---

## 8. 发布与导出

### 8.1 发布

```
发布类型 [覆盖发布 ▾]
访问加密 [开关]   开启后，访问发布页前需要输入密码
有效期  [⊖] ── 未设置则永久有效 ── [+] 天
```

**三个决定：发什么、要不要密码、多久失效。**

### 8.2 导出（整包加密）

```
整包加密 [开关]   启用后将按桌面端兼容格式加密整个项目包
导出口令 / 确认口令 / 导入口令（选填）

ⓘ 当前项目包含公共 API 或数据库，必须启用整包加密
```

**含敏感数据源的项目强制加密，无敏感配置的导出明文包**。它把"敏感信息"的边界定义在数据源配置上，不笼统加密所有项目。

---

## 9. 完整 API（41 个）`[代码]`

```
AI 驱动（20）：attachment/upload  item/list  model/providers  settings/get|save
              task/cancel|events|operation/complete|resume|status|steer|submit
              thread/archive|create|events|list|read|update  turn/list|read
项目（5）：create  createSubProject  pageList  update  cover
模板（3）：create  batchDel  getAllTemplate
授权（3）：checkAuth  getAuthCode  hasAuth
导入导出（2）：exportProject  importProject
远程组件（2）：list  upload
资源（2）：image/getUserUploadedImageList  video/page
其他（4）：aiModel/configuredList  projectAiMemory/save  commonDatabase/get  release/release
```

**没有数据源相关 API**——静态/API/数据库全前端直连，数据库走 `/api/db/executor/execute`。
**没有任何协作 API**——大概率不支持多人编辑。

---

## 10. 八个 C 端设计决策

| # | 决策 | 说明 |
|---|---|---|
| 1 | **画布主权** | 零常驻面板，所有面板浮层化，画布占 95% |
| 2 | **属性克制** | 滑块 2 个、色块 5 个，只暴露有概念的东西 |
| 3 | **发布即分享** | 链接 + 密码 + 有效期，不做打包部署 |
| 4 | **空状态讲用途** | 四个空态都说"这东西有什么用" |
| 5 | **搜索语境化** | 组件库内 `⌘F`，不是全局 `Ctrl+K` |
| 6 | **保存状态带时间戳** | 「已保存 11:13:17」是信任凭据 |
| 7 | **面包屑替代页面树** | 「项目 › 主项目 › 图层0」是文件系统心智 |
| 8 | **配置维度图标化** | 6 个 tab 用图标竖排，不是文字 tab |

### 与 GoViewPro 的对照

| | LIGHT CHASER | GoViewPro |
|---|---|---|
| 画布占比 | 95% | 57% |
| 属性数 | 2-5 个封顶 | 40+ |
| 组件分类 | 视觉形态 | 业务域 |
| 发布 | 链接 | 部署包 |
| 用户 | 业务人员 | 实施工程师 |

---

## 11. 未验证项

| 项 | 原因 |
|---|---|
| 「自定义主题」编辑器 | 已读取结构与默认值；颜色选择器已读取（纯色 + 透明度，无渐变）；「添加 / 更新」与「更新全局主题」的保存行为未验证（只读阶段未点击） |

| 弹框 / 全局变量节点的配置 | UI 操作受工具限制 |
| 面积图 X轴「刻度线」内是否含「子刻度」 | 未确认 |
| system prompt 全文 | 在服务端 |
| 线上版本与本文结论的一致性 | 本轮通过设计器地址 `http://www.lcdesigner.cn/designer?id=2121770412771979265` 可访问（此前根域与 www 均返回 ERR_CONNECTION_REFUSED / ERR_NAME_NOT_RESOLVED）；未逐项复核全部结论的线上版本 |
| 权限 / 协作 | 无相关 API，大概率不支持 |

---

*本文档整合自 4 份早期文档，删除重复与过程性叙事。所有结论可追溯到 UI 截图、DOM 或 bundle 字符串。*
