# Material Cover Adaptive Fit Checklist

> 状态：已完成（2026-08-16，`pnpm verify:fast` 与 `pnpm verify:browser` 全绿）

## 自适应决策（R1）

- [x] `materialCoverFit` 为导出纯函数，阈值：放大倍数 `max(boxW/natW, boxH/natH) > 1.5` → contain；
      宽高比偏差 `|natW/natH − boxW/boxH| / (boxW/boxH) > 0.35` → contain；其余 cover。
- [x] 尺寸为 0 / NaN / Infinity（布局未就绪或异常图片）→ cover 安全缺省。
- [x] 决策仅一次（load 时），不随容器变化重算；决策不进任何契约（`cover` 字段校验不变）。

## contain 生效与占位层收起（R2）

- [x] `load` 后决策为 contain：缩略图容器置 `data-material-cover-fit="contain"`，CSS 后代选择器
      `object-fit: contain` 生效，不写内联样式；cover 决策不写标记。
- [x] 封面加载成功后占位层收起：底色切换中性表面 Token（浅色主题自动适配）、网格 `::before` 隐藏、
      占位图标淡出；透明素材不再透出彩色渐变/网格。
- [x] 底色切换无过渡动画；既有 opacity 过渡与 reduced-motion 行为不变；加载前/后/回退几何恒定。
- [x] `error` 仍移除 `<img>` 并恢复完整占位层（彩色渐变/网格/图标）。

## 边界不变（R3）

- [x] `cover` 校验、manifest 语义、catalog 身份与 ADR-0040 一致；官方物料与既有 320×200 探针封面
      保持 cover 行为不变。
- [x] 无新增网络行为（不预取/重试/代理/二次请求）；`materialLibraryState`、宿主动作、卡片可用性不变。
- [x] 未做服务端缩略图/转码（ADR-0027 归宿主）；未做内容感知裁切；未响应容器尺寸变化。

## 质量门禁

- [x] engine 聚焦测试（`materialCoverFit` 决策矩阵 + 卡片 DOM，12 个）通过；engine lint/typecheck/test 通过。
- [x] `pnpm verify:fast` 全量通过。
- [x] `pnpm verify:browser` 通过（含自适应探针断言：正常封面 cover、窄条封面 contain）。
- [x] 基线 README、docs/specs/README.md、docs/decisions/README.md、usage.md 已登记；ADR-0040 顶部
      互注 ADR-0041。
