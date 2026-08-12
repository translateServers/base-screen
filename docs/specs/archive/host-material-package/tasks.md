# Tasks

- [x] 接受 ADR-0029 并建立本 Spec 三件套与实施计划。
- [x] plugin-sdk 实现 `createMaterialPackage` 公共 API。
  - [x] 创建期完整校验：id 语法、空材料列表、上限 512、畸形输入、manifest、静态 manifest、适配器、包内重复 type/tagName。
  - [x] `define()` 注册前冲突预检原子化（任一冲突不产生部分注册），显式注册并返回 entries；失败带 `['materials', index, ...]` 定位诊断；创建与失败路径不访问浏览器全局。
- [x] plugin-sdk 聚焦测试覆盖 R1/R2 全部场景（含幂等、预检无部分注册、冲突、上限、畸形输入、无注册表、适配器透传）。
- [x] browser-harness 增加托管物料包示例模块与宿主加载演示（宿主受控 `import()` 动态加载、auto-register 风格入口、独立 catalog/Viewer，不污染主流程）。
- [x] verify-browser-harness 增加托管包注册与渲染闭环断言（`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED` 分支）。
- [x] 更新 ADR/Spec/计划索引、包开发顺序与 usage.md 集成说明。
- [x] 运行聚焦检查与完整质量门，按证据更新 test-matrix 与 checklist。
- [x] Browser harness adds a host-accepted draft package and unload/reconfigure/publish preflight demonstration without runtime API changes.
