---
'@base-screen/engine': minor
'@base-screen/sdk': minor
'base-screen': minor
---

移除设计器的对比度守卫：底栏「对比度」条目与详情弹层、画布文本对比度测量与修复预览一并删除。公开 API 去掉
`BASE_SCREEN_GUARD_CHANGE_EVENT`（`base-screen-guard-change` 事件不再派发）、`DesignerGuardSnapshot`、
`DesignerContrastIssue`；度量事件名去掉 `guard_fail`、`fix_preview`、`fix_apply`。core 的对比度计算函数保留
（大屏截图探针与示例后端仍在使用）。
