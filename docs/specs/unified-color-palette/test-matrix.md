# Unified Color Palette Test Matrix

| Case | Requirements | Evidence | Status |
| --- | --- | --- | --- |
| U1 | R1 | palette 单元测试：三模式渲染、色标行、添加/删除按钮边界 | Passed |
| U2 | R2 | 所有 color 字段渲染完整三段控件（渐变全部可用），单色值仍渲染渐变控件 | Passed |
| U3 | R3 | 解析/序列化往返、非法渐变回退、乱序色标拒绝提交 | Passed |
| U4 | R4 | 三模式草稿缓存复用与文档漂移失效 | Passed |
| U5 | R5 | 色标增删后 DOM 更新 + change 派发 + 读值序列化 | Passed |
| U6 | R5 | base.text 渐变字符串经 background-clip: text 渲染；单色与切换清除 | Passed |
| U7 | R1/R5 | 面板控制器渲染（style.color 全模式可用）+ descriptor 事务回归 | Passed |
| U8 | 完成定义 | engine 全部测试与 `pnpm verify:fast`（全仓 1054 tests） | Passed |
| U9 | R1/R5 | 单条共享渐变滑轨、多色标手柄、相邻色标动态范围、数字输入同步、预览更新与 change 提交 | Passed |
