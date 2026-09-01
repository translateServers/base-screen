# DataV-Inspired Global Variables Checklist

- [x] 文档仍只有 `static | host`，没有 URL/SQL/API/过滤器/轮询字段。
- [x] 目录响应严格、分页有界，目录与变量解析 capability/port 配对。
- [x] 作者预览不写文档/历史，未授权、超时和迟到结果不泄露值。
- [x] 被引用变量重命名为单个 Core 命令，删除继续失败关闭。
- [x] 同 ID 多别名只解析一次，多目标刷新原子提交，未变化不查询资源。
- [x] Blueprint 只使用 literal、事件 payload/path 与变量表达式。
- [x] 新增控制器满足文件规模门禁，无新增包或生产依赖。
- [x] 聚焦测试与真实 Browser harness 覆盖核心作者和运行路径。
- [x] 完整 `pnpm verify:m0` 通过并更新本记录（2026-09-01）。
