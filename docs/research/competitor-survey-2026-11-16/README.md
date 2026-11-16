# 大屏设计器调研总览

> 2026-11-16
> 对象：LIGHT CHASER（lcdesigner.cn）、GoViewPro（ai.goviewlink.com）
> 目的：为 base-screen 的组件体系、属性面板、事件编排提供设计参考
>
> **文档集**：本文 + `LIGHT-CHASER.md` + `GoViewPro.md` + `COMPONENTS.md`

---

## 1. 三者根本不在同一层

| | GoViewPro | LIGHT CHASER | base-screen |
|---|---|---|---|
| 是什么 | 交付工具 | C 端内容工具 | 可嵌入基座 |
| 用户 | 实施公司 | 业务人员 | 宿主开发者 |
| 交付物 | 部署包到客户机房 | 一个分享链接 | `<base-screen-designer>` 标签 |
| 画布默认占比 | **57%** | **95%** | 宿主决定 |

这个差异决定了一切取舍。

---

## 2. 能力对照

| 能力 | GoViewPro | LIGHT CHASER | base-screen |
|---|---|---|---|
| 面板形态 | 常驻（380px） | 浮层 | slot 可覆盖 |
| 属性面板 | 4 tab × **4 竖排大类** | 6 tab × 折叠组 | descriptor zones |
| 组件分类 | 业务域 | 视觉形态 | material catalog |
| 事件编排 | 四栏表单 | 节点图 | 语义图（relations） |
| 条件表达 | 任意 JS | 任意 JS | 结构化 8 运算符 |
| 数据源 | 组件级（4 种来源）；**数据池未核实** | 组件级 + **蓝图节点** | datasetPort |
| 动画 | **完整系统**（3 档 + 5 类效果库） | 无（仅组件内置） | 仅 visibility transition |
| 组件行为层 | **有**（事件穿透/钉固/悬浮） | 无 | 无 |
| AI | 场景卡片（修改功能未解锁） | Agent（字段级冲突检测） | intent + 草案 |
| 发布 | 部署包 + 源码 | 链接 + 密码 + 有效期 | 归宿主 |
| 加密导出 | 未观察 | 有（含敏感配置强制） | 归宿主 |
| 协作 | 未观察 | 无（API 层面确认） | 归宿主 |

---

## 3. 八个可落地的建议（按投入产出排序）

| # | 建议 | 成本 | 依据 |
|---|---|---|---|
| 1 | **Alt 框选的可发现性**（引擎已支持 Alt 切换包含/相交） | 极低 | `designer-marquee-gesture.ts` 已实现，缺提示 |
| 2 | **descriptor 加 `segmented` 控件** | 低 | 两家属性面板高频使用 |
| 3 | **`ui-text` 加命名冲突检查** | 低 | 文字内边距在 GoViewPro 中叫「X轴内边距」，命名与轴无关（见 COMPONENTS §8） |
| 4 | **在 expectedRevision 之上补字段级前置条件** | 中 | LIGHT CHASER 字段级冲突检测；base-screen 已有文档级 revision |
| 5 | **补「行为」zone**（事件穿透/钉固/悬浮/裁切） | 中 | GoView 的「高级」大类 |
| 6 | **补「形状」能力**（3 轴旋转/倾斜/缩放） | 中 | GoView 的「形状」大类 |
| 7 | **补 lifecycle / timer 两种 trigger** | 中 | LIGHT CHASER 的全局节点 + 定时器 |
| 8 | **物料加 aiCapability**（可从 descriptor 派生） | 中 | LIGHT CHASER 的三层 AI 描述机制 |

### 不建议做的

| 不做 | 理由 |
|---|---|
| 通用动画系统 | LIGHT CHASER 作为 C 端产品都不做；与"AI 生成 + 人审核"冲突 |
| 数据源做成蓝图节点 | 会让引擎感知数据流，与 datasetPort 边界冲突 |
| 为控件做专用关联 UI | GoView 的历史包袱；blueprint 一套管所有更干净 |
| 自建项目/资源/发布后端 | 违反 ADR-0027 的定位 |

---

## 4. 三家最本质的分歧：默认状态

**打开时画布占 57% 还是 95%，属性面板给 40 个字段还是 2 个——这个选择决定了产品气质，而且它往往不写在需求文档里。**

- GoViewPro：认为用户需要随时看到面板 → 画布 57%，柱状图 40+ 字段
- LIGHT CHASER：认为画布优先 → 画布 95%，滑块只有 2 个属性

**base-screen 作为基座，正确做法是"引擎给足表达力，descriptor 默认克制"**——物料作者决定自己站哪一边。

---

## 5. 证据等级

本文档集的断言按可信度标记：

| 标记 | 含义 |
|---|---|
| `[实拍]` | 截图，坐标经 move 校准 |
| `[DOM]` | DOM 的 aria-label / 文本 |
| `[代码]` | bundle 或 config 提取 |
| `[单次]` | 只观察一次 |
| `[推测]` | 基于同类产品推断 |

**LIGHT CHASER 的证据最硬**（线上 bundle 分析 + UI 实测）。
**GoViewPro 只有界面观察**——未做 bundle 分析，组件清单、API、AI 协议三项**未获取**。

---

## 6. 已修正的错误（10 处）

调研过程中犯过系统性错误：坐标估算不准、单次观察就下结论、没滚到底就统计。以下断言曾被写错，现已修正：

| 原断言 | 实际 |
|---|---|
| GoView 无右键菜单 | **有** |
| GoView 面板按组件族各写一套 | 只有「图形」大类特有，形状/滤镜/高级全通用 |
| GoView 文字只有 2 个折叠组 | 那是「图形」下 2 组，另有 3 大类 |
| 3D 变换是 LIGHT CHASER 独有 | GoView 也有，且多了缩放 |
| 滤镜默认值不一致（hueRotate 0 vs 1） | **都是 0**，截图分辨率不够看错 |
| 翻牌器 `justify` | 实际 `justifyContent` |
| 翻牌器 `color: "#ffffff"` | 原记为 `#fffffff`，是误记；运行时 config 为 `#ffffff`，原文档无误 |
| LIGHT CHASER 组件库 7 个一级分类（含「时间」「3D」） | 「所有」+ 8 个分类，无「时间」；3D 模型在「媒体」下 |
| LIGHT CHASER 属性面板 6 个 tab | 仅图表类（面积图）为 6 个；数字翻牌器为 5 个（无「映射」） |
| LIGHT CHASER 没有行为层 | 成立，但当时未滚动验证，现已确认 |

**教训**："没反应"有两种可能——产品没这个功能，或者我没点中。**必须先 hover 确认命中，再判断功能是否存在。**

---

## 7. 待验证项（复核后）

| 项 | 卡在哪 |
|---|---|
| GoView「形状」面板是否到底（有无透视/原点） | **已查**：9 个字段 + 启用裁切，**无透视、无原点**（见 GoViewPro.md §3.2） |
| GoView 的「全局样式」「全局脚本」内容 | **已查**（GoViewPro.md §8） |
| LIGHT CHASER 的「主题」tab | **已查**：组件级 7 套预设（42 色）+ 「编辑主题」对话框；全局「画布主题设置」对话框（见 LIGHT-CHASER.md §2.7） |
| LIGHT CHASER 面积图 X轴「刻度线」内是否含「子刻度」 | 未确认 |

---

## 8. 来源与限制

| 产品 | 来源 | 限制 |
|---|---|---|
| LIGHT CHASER | 线上 bundle 字符串分析 + UI 实测（官网本次无法连通，线上版本未复核） | DataVisool License 1.0，非 OSI 开源 |
| GoViewPro | 仅人工界面观察 | 未做 bundle 分析，数据层未覆盖 |
| base-screen | 仓库实读（AGENTS.md / contracts / plugin-core） | — |

所有"如何实现"的技术推演都标了 `[推测]`，不是源码结论。
