# 组件与属性设计：两个产品的做法

> 2026-11-16
> 基于 LIGHT CHASER（55 组件 + 完整 config）与 GoViewPro（4 tab × 4 大类）的实测
> 目的：提炼可复用的设计模式

---

## 1. 组件分类：两种标准

| | LIGHT CHASER | GoViewPro |
|---|---|---|
| 一级 | 所有 / 图表 / 信息 / 地图 / 装饰 / 模型 / 媒体 / web元素 / 其他 | 图表 / 地图 / 3D / 素材 / 装饰 / 交互 / 物联 / 图标 / 图片 / 收藏 / 组件 / 侧显 |
| 二级 | 条形/柱状/折线/饼/散点/词云/面积/雷达/漏斗/进度/玫瑰/玉珏 | 柱状/折线/饼/散点/地图/时间轴 |
| 依据 | **视觉形态** | **混用**（形态 + 用途 + 行业） |

**LIGHT CHASER 只用一套标准**，GoView 混了三套。

**混用的代价**：用户在"按形状找"和"按用途找"之间反复切换。

**正确做法**：一级分类只用一套标准；业务域用**标签**而不是分类。

```ts
{ category: 'chart', tags: ['工业', '泵风机'] }
```

---

## 2. 属性面板的分层

### 2.1 两家的层级结构

**LIGHT CHASER：6 tab，直接到折叠组**

```
[基础][样式][数据][映射][滤镜][主题]
  └─ 样式 → 图形/X轴/Y轴 → 基础/数据点/数据线 → 字段（三级折叠）
```

**GoViewPro：4 tab × 4 竖排大类**

```
[定制][动画][数据][事件]
  └─ 定制 → 图形 | 形状 | 滤镜 | 高级 → 折叠组 → 字段
```

### 2.2 关键差异：第 1 层的含义

| | 第 1 层叫法 | 含义 |
|---|---|---|
| LIGHT CHASER | 图形 / X轴 / Y轴 | **视觉部件**（图上能看见的东西） |
| GoViewPro | 图形 / 形状 / 滤镜 / 高级 | **配置域**（前一个是部件，后三个是能力） |

**判据：分组名能不能从一个没看过文档的用户嘴里说出来？**

- ✅ 「图形」— 用户能说"我要改柱子"
- ❌ 「渲染器」— 用户不知道什么是渲染器

### 2.3 GoView 的分层更清晰

```
图形  → 组件特有（每个组件不同）
形状  → 全通用：3 轴旋转 / 倾斜 / 缩放 / 裁切
滤镜  → 全通用：7 参数 + 混合模式
高级  → 全通用：事件穿透 / 容器超出 / 钉固 / 悬浮 / JSON 编辑
```

**只有「图形」是组件特有的，另外三个全通用。** 这是很干净的分层——通用能力集中，特有能力隔离。

LIGHT CHASER 的对应能力分散在「基础」「滤镜」「主题」三个 tab 里，没有「行为」这一层。

---

## 3. 属性的取舍：2 个 vs 40+

| 组件 | LIGHT CHASER | GoViewPro |
|---|---|---|
| 滑块 | **2 个**（滑块颜色、轨道背景色） | 未知 |
| 基础色块 | **5 个** | 未知 |
| 面积图 | 约 30 个 | 未知 |
| 柱状图 | — | **一级 5 组 + 2 系列**（渲染器 / 容器 / X轴 / Y轴 / 图例；字段明细见 GoViewPro.md §13）。原「40+」为未实测估计，已更正 |

**判据：用户脑子里有没有对应概念？**

- "滑块颜色" → 有
- "X轴内边距" → 没有（那是 padding 的误译，见 §8）
- "渲染器" → 没有（技术选型）

**GoView 违反这条是因为它的用户是实施工程师**，他们确实需要这些。

**两边都要满足的分层方式**：

```
常用属性 → 默认展示
高级属性 → 折叠或独立 tab
引擎参数 → 只在 JSON 编辑里出现
```

---

## 4. 多系列：数据建模 vs 配置建模

### LIGHT CHASER：系列在数据里

```js
{ dimensions: ["product", "挂号人数", "服药人数"], source: [...] }
```

`dimensions[0]` 是 X 轴，其余是系列。**加系列 = 数据加一列**。面板只有通用的"图形/数据点/数据线"，没有"系列1/系列2"。

### GoViewPro：系列是配置对象

```
▶ 柱状图-1  ⌄  🗑
   图形  15  2   [启用渐变色]
   标签  开关  12  #fff  上/左/右
▶ 柱状图-2  ⌄  🗑
```

**每个系列有独立的视觉配置，可单独删除。**

### 影响

| 操作 | LIGHT CHASER | GoViewPro |
|---|---|---|
| 加系列 | 改数据 | 点按钮 |
| 不同系列不同颜色 | 在数据/主题里配 | 每个系列单独配 |
| 不同系列不同圆角 | **做不到** | 可以 |
| 10 个系列 | 数据里 10 列 | **10 个折叠组** |

**建议**：默认用数据建模，给一个可选覆盖口子：

```ts
seriesStyle?: Record<string, Partial<Style>>   // 只存差异
```

默认不展开，用户点"自定义某系列"才创建。面板不膨胀，表达力不封死。

---

## 5. 数据映射：下拉 vs 表格

**LIGHT CHASER：两个下拉**

```
X字段 [name ▾]   Y字段 [value ▾]
```

选项自动取自数据 JSON 的字段名。**只够最简单的单系列图表。**

**GoViewPro：三列表格**

```
┌─────────┬──────────┬────────────┐
│ 源字段   │ 映射      │ 状态&过滤   │
│ product │ [product] │ 图表分...   │
│ data1   │ [data1]   │ ☑ 成功      │
└─────────┴──────────┴────────────┘
```

**字段映射本质是 N:N 关系，天然是表格。** 用两个下拉是把 N:N 压成 1:1。

**折中**：默认两个下拉（简单场景），提供"展开为表格"的入口（多系列）。

---

## 6. 三个组件的 config 结构

| 组件 | 行数 | 结构 | 字段数 | 面板 |
|---|---|---|---|---|
| 面积图 | **263** | 扁平（G2Plot） | 30+ | 三级嵌套 |
| 表格 | 133 | `style` 嵌套 | 15 | 未展开 |
| 翻牌器 | **29** | `style` 嵌套 | 12 | **全平铺** |

**属性面板的形态由字段数量决定**：

| 字段数 | 形态 |
|---|---|
| ≤ 15 | 平铺 |
| 16-25 | 一级折叠（3-5 组） |
| > 25 | 二级折叠（组 → 子组） |

### 6.1 面积图（263 行）

```js
{
  data: [...], xField: "name", yField: "value",
  label: {...}, supportCSSTransform: true, isStack: false, startOnZero: false,
  point: { size, style: {fill, stroke, lineWidth} },
  line: { color: "r(...)", size },
  areaStyle: { fillOpacity, fill: "l(90) ..." },
  xAxis: { range, label, line, tickLine: null, subTickLine: null, title: null, position },
  yAxis: { tickCount, grid: null, label, ... },
  legend: { position, layout, itemName },
  animation: { appear: { animation: "wave-in", duration: 3000 } },
  filter: {...}
}
```

### 6.2 表格（133 行）

```js
{
  style: {
    columns: [{ key, label, textAlign }],
    data: [...],
    header: { height: 30, fontSize: 14, fontWeight: 900 },
    body: {
      background, color, fontSize, fontWeight,
      enableCarousel: false, carouselSpeed: 3,
      carouselPauseSeconds: 0.08, pageSize: 5,
      lineBackground: [渐变1, 渐变2]      // 交替行背景
    }
  },
  filter: {...}
}
```

### 6.3 翻牌器（29 行）

```js
{
  style: {
    fontSize, fontWeight, fontFamily, color,
    type: "caper",                 // 跳动
    justifyContent, alignItems,
    prefix, suffix, decimalPlaces, separator, duration
  },
  filter: {...}
}
```

### 6.4 三条结论

**一、配置结构不统一**

图表用 G2Plot 扁平格式，基础组件用 `{style: {...}}` 嵌套。**唯一一致的是 `filter` 永远在 `config` 顶层**——引擎级能力在顶层，组件级在 style 内。

**二、组件的专有字段暴露了它的本质**

| 组件 | 专有字段 | 说明 |
|---|---|---|
| 面积图 | `point/line/areaStyle/xAxis/yAxis` | 图形学结构 |
| 表格 | `columns/header/body.lineBackground` | 行列结构 |
| 翻牌器 | `prefix/suffix/decimalPlaces/separator/duration` | 数值格式化 |

**三、三个组件三种动画配置方式**

| 组件 | 动画在哪 |
|---|---|
| 面积图 | `animation.appear`（G2Plot 入场） |
| 翻牌器 | `style.duration` + `style.type` |
| 表格 | `style.body.carouselSpeed` |

**没有统一抽象**。GoView 在这点更强（一套动画 tab 管所有组件）。

---

## 7. 控件体系

### LIGHT CHASER（14 种）`[代码]`

```ts
text / number / boolean / select / color / json / group / array /
repeatable-array / reorderable-array / field-selector / unit-number /
stepper / custom
```

**缺 `segmented`**（二选一分段）。

### 实际映射

| 控件 | 形态 |
|---|---|
| `stepper` | `[300] [−] [+]` 三段式 |
| `unit-number` | `[10] px` |
| `color` | 色块 + hex + 单色/渐变/径向 |
| `boolean` | 开关或分段 |

### 两家的颜色控件

**LIGHT CHASER**：`[#ffffff] [单色]` → 点开是渐变编辑器（色标滑块 + 透明度 + 位置 + 角度）

**GoViewPro**：`[═══渐变条═══] [✎][🗑]` → **直接展示当前渐变**

**GoView 更好**：用户判断"颜色对不对"靠看，不靠读 hex。

### LIGHT CHASER 的渐变编辑器（完整）

```
[渐变预览条，带棋盘格]
[单色]  [渐变]  [径向]
●━━━━━━━━●
色标1      透明度
#016EB7   ●━━━ 100
位置       角度
0          90
[+] [🗑]
```

可以给 GoView 没有的：**多色标编辑**。

---

## 8. 命名问题

### 8.1 「X轴内边距 / Y轴内边距」

**仅 GoViewPro 使用**（文字组件样式），LIGHT CHASER 未观察到该名称。

**这是明确的错误**：文字的内边距是 `padding-left/right` 和 `padding-top/bottom`，和"轴"毫无关系。

`[推测]` 起源可能是把"水平 padding"误叫成 X 轴。

**正确命名**：左右内边距 / 上下内边距。

### 8.2 LIGHT CHASER 的同词不同义

- 基础 tab：位置坐标叫「**X轴**」「**Y轴**」
- 样式 tab：图表坐标轴也叫「**X轴**」「**Y轴**」

**同一界面两个概念一个词。**

### 8.3 GoViewPro 的抽象词无落点

- 「渲染器」「容器」——用户不知道里面是什么
- 「对齐配置数量」——描述的是"按钮做什么"，不是"它控制什么"，应该叫「批量对齐」

### 命名检查清单

1. 同一个词在界面里只能指一个概念
2. 分组名要能被用户说出口
3. 按钮文案描述结果，不是动作

---

## 9. 十二个可复用的模式

| # | 模式 | 出处 | 说明 |
|---|---|---|---|
| 1 | 一级分类只用一套标准 | LC | 形态 or 用途，不要混 |
| 2 | 属性树第一层是视觉部件 | LC | 「图形」优于「渲染器」 |
| 3 | 默认只暴露 2-5 个属性 | LC | 滑块 2 个、色块 5 个 |
| 4 | 技术参数进高级/代码 | LC | 引擎参数不给普通用户 |
| 5 | tab 按任务切或按类型切，不要混 | 两家 | 4 宽 tab vs 6 窄 tab |
| 6 | 系列默认放数据里 | LC | 需要独立视觉时再提升 |
| 7 | 字段映射用表格 | GoView | N:N 关系天然是表格 |
| 8 | 颜色控件直接展示效果 | GoView | 渐变条优于 hex |
| 9 | 二元选择用分段不用下拉 | 两家 | `[水平][垂直]` |
| 10 | 数值用三段式步进 | 两家 | `[值][−][+]` |
| 11 | 开关前置 | GoView | 「启用动画」「告警规则」在最上 |
| 12 | 空状态讲用途 | LC | 「新建变量后可在组件和蓝图中复用」 |

---

## 10. 对 base-screen 的五条建议

### 10.1 descriptor 拆成 basic + style

```ts
// 现在
appearance: [...]           // 通用和特有混在一起

// 建议
appearance: {
  basic: [...],             // 位置/尺寸/旋转（引擎自动生成）
  style: [...]              // 组件特有
}
```

依据：LC 的「基础」和「样式」分开，GoView 混在「定制」里。

### 10.2 补「行为」zone

```ts
interface ScreenComponentBehavior {
  pointerEvents?: 'auto' | 'none'      // 事件穿透
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll'
  sticky?: boolean                      // 钉固
  cursor?: 'default' | 'pointer'
}
```

**这些是纯 CSS，引擎统一渲染，不需要物料实现。**

### 10.3 补「形状」能力

3 轴旋转 + 双轴倾斜 + 双轴缩放，对任何组件都适用，应该由引擎提供。

### 10.4 每个 material 声明属性预算

```ts
attributeBudget: { default: 5, advanced: 20 }
```

超过预算必须折叠。能防住"把 ECharts option 全暴露"。

### 10.5 系列建模留 overrides 口子

```ts
seriesStyle?: Record<string, Partial<Style>>
```

默认继承全局，只存差异。面板不膨胀，表达力不封死。

---

*本文整合自 5 份组件分析文档，删除重复。所有 config 来自代码面板实录，面板结构来自逐项展开。*
