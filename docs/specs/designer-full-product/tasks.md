# Designer Full Product 任务

> 状态：实施中
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

- [x] Task 1：修复可信基线（R1、R9）。
  - [x] 修复 Blueprint expression 控件的 disabled 语义并以原生输入测试证明。
  - [x] 将 `resourceId` 纳入 Renderer host-resource identity 并覆盖重解析。
  - [x] 调用 Layers browser workflow 或收紧测试矩阵声明。
  - [x] 复核完成规格中的证据文字，不将未覆盖行为标作已验证。

- [x] Task 2：冻结宿主产品与资源公共契约（R2、R5、R6、R9）。
  - [x] 完成 ADR-0017、ADR-0018 与对应 Contracts/Core/Plugin Core Spec 更新。
  - [x] 定义 fail-closed 的项目目录、预览、快照、资产、资源、变量和授权 action ports。
  - [x] 为全部新增 canonical shape 建立 strict parser、诊断、schema golden 和 round-trip 测试。

- [ ] Task 3：完成编辑器效率与画布图层增量（R3、R4、R9）。
  - [ ] 统一所有快捷键、菜单和帮助元数据。
  - [ ] 完成工作台模式、通知、可调整面板、物料搜索/收藏/最近使用与安全 JSON 编辑。
  - [ ] 完成工具、修饰键、参考线、网格、吸附、selection-fit、Layers 键盘和大集合验收；画布移动与选区吸附由 [Designer Canvas Precision](../designer-canvas-precision/spec.md) 增量实施。

- [ ] Task 4：完成物料、资产和数据作者能力（R5、R6、R9）。
  - [ ] 增加经 Manifest/Renderer conformance 验收的基础物料。
  - [ ] 实现变量、资源、资产和数据状态的宿主解耦闭环。
  - [ ] 覆盖取消、去重、超时、资源替换、删除保护和敏感信息隔离。

- [ ] Task 5：完成图形 Blueprint spike 与实现（R7、R8、R9）。
  - [ ] 比较图形和 JSON 编辑候选并记录准入证据。
  - [ ] 在通过 Gate 后实现私有 adapter、图形投影和等价键盘路径。
  - [ ] 实现 diagnostics、模板、模拟、日志与双实例/cleanup/browser 测试。

- [ ] Task 6：完成宿主项目产品和发布证据（R2、R9）。
  - [x] 实现最小项目目录、快照和预览 capability-gated UI，复用 Engine 公共方法并提供中文可访问反馈。
  - [ ] 实现目录、预览、发布、冲突、快照、恢复、导入、导出和 capability feedback。
  - [ ] 完成全量 test matrix、provenance、API、boundary、tarball、browser 与 `pnpm verify:m0`。
