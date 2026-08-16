# Material Cover Adaptive Fit Spec

> 状态：生效中（2026-08-16）
> 依据：[ADR-0041](../../decisions/ADR-0041-material-cover-adaptive-fit.md)、[ADR-0040](../../decisions/ADR-0040-material-manifest-cover.md)

## 1. 目标

修复 ADR-0040 封面在真实宿主素材（小图、异形图、透明图）上的视觉问题：封面 `<img>` 加载完成后按
「容器尺寸 vs 图片自然尺寸」做一次自适应适配决策——小图不放大、异形图不暴力裁切、透明图不透出彩色
占位背景；照片类封面保持铺满裁切。全部是加载后的一次性展示决策，无抖动、无新增网络行为、不改变
`cover` 字段契约与宿主边界。

## 2. Requirements

### R1：自适应适配决策

- 新增纯函数 `materialCoverFit(naturalWidth, naturalHeight, boxWidth, boxHeight): 'cover' | 'contain'`
  （engine 物料库 DOM 模块导出，供单元测试）。
- 放大倍数 `upscale = max(boxW/natW, boxH/natH)`；`upscale > 1.5` → `contain`（不放大、完整显示、居中）。
- 宽高比偏差 `aspectMismatch = |natW/natH − boxW/boxH| / (boxW/boxH)`；`> 0.35` → `contain`（不裁切）。
- 两个阈值都未超 → `cover`（缺省，与 ADR-0040 行为一致）。
- 任一尺寸为 0 或非有限数（布局未就绪/异常图片）→ `cover`（安全缺省，不做决策）。
- 决策仅发生一次（图片 `load` 时），不随容器尺寸变化重算。

### R2：contain 生效与占位层收起

- `load` 处理中：决策为 `contain` 时在缩略图容器置 `data-material-cover-fit="contain"`（CSS 后代选择器
  `.material-thumb[data-material-cover-fit="contain"] .material-cover { object-fit: contain; }` 生效），
  不写内联样式；`cover` 为缺省不写标记。
- 封面加载成功后（无论 cover/contain），缩略图占位层整体收起：底色切换为中性深色（浅色主题对应中性
  浅色），网格 `::before` 隐藏，占位图标按 ADR-0040 淡出；透明素材不再透出彩色渐变/网格。
- 上述底色切换是状态切换（无过渡动画），不引入新 transition；`data-material-cover-loaded` 的既有
  opacity 过渡与 reduced-motion 行为不变。
- 加载失败仍按 ADR-0040 移除 `<img>`、恢复完整占位层（含彩色渐变/网格/图标）。

### R3：边界不变

- `cover` 字段校验、manifest 语义、catalog 身份与 ADR-0040 完全一致；自适应是纯展示启发式，不进契约。
- 不新增网络行为（不预取、不重试、不代理、不二次请求）；不改变 `materialLibraryState`、宿主动作、
  卡片可用性、几何恒定（无抖动规约）。
- 官方物料与既有探针封面（320×200，宽高比与容器一致）行为不变（保持 `cover`）。
- 非目标：服务端缩略图/转码（ADR-0027 归宿主）；内容感知裁切；容器变化响应。

## 3. 非目标

- 服务端缩略图生成、转码、缓存（宿主职责，ADR-0027）。
- 图片内容感知（主体/人脸检测）或智能居中。
- 响应式重算（容器尺寸变化不改变适配方式）；hover/搜索状态不改变适配方式。
- 修改 `cover` 字段契约、校验规则、manifest 语义或 ADR-0040 的其余决策。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部勾选；测试矩阵与当前实现一致。
- engine 聚焦测试（`materialCoverFit` 决策 + 卡片 DOM）、engine lint/typecheck/test、
  `pnpm verify:fast` 与 `pnpm verify:browser`（含自适应探针断言）全部通过。
- ADR-0041/Spec 索引（docs/specs/README.md、docs/decisions/README.md）、usage.md 与基线 README 已登记。
