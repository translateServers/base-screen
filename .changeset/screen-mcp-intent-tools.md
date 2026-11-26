---
'base-screen': patch
---

`tooling/screen-mcp-server` 新增两个无状态工具（ADR-0113 S8）：`compile_screen_intent`（模型原文或 IR + 目录 → 文档候选、来源表、按模型路径整理的修复诊断与告警，与设计器宿主前端同一份实现）与 `solve_layout`（区域序列 → 像素矩形，装不下返回 `LAYOUT_CAPACITY_EXCEEDED` 与差额）。冒烟检查更新为 14 个工具。
