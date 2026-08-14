# Designer Topbar Project Title Checklist

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 行为（R1、R2）

- [x] 项目模式顶栏显示加载的大屏名称；无项目/空名称回退「未命名大屏」。
- [x] 更新仅在既有渲染路径内完成，无额外 DOM 重建、尺寸变化或异步依赖。

## 质量（R3）

- [x] 真实 browser harness 断言顶栏项目名（`assertTopbarProjectName`：harness 项目名「浏览器验证」）。
- [x] 宿主浏览器验证顶栏显示真实大屏名称（xjdatahub「测试」而非「未命名大屏」）。
- [x] `pnpm verify:m0` 通过，能力基线已同步。
