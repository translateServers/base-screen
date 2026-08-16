# Designer Multi Selection Editing Test Matrix

> 状态：进行中

| 需求 | 聚焦单元测试（engine） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 批量几何 | ✅ 宽度/高度/旋转事务形状（每选中组件一条 update-components，patch size/rotation、clamp/round） | ✅ 多选批量改宽度，全部生效且恰一条撤销记录 |
| R2 样式交集 | ✅ 同类型交集=全字段；text+rect 混合交集为空；交集按 styleSchema 过滤 | ✅ 多选 2 个文本批量改字号/颜色生效；混合多选只显示几何区 |
| R3 值显示与提交 | ✅ 不一致值显示焦点组件值；编辑后应用到全部；事务恰含 N 条命令；批量颜色（含渐变字符串）提交 | ✅ 批量改字号后全部组件样式更新 |
| R4 锁定与可用性 | ✅ 锁定成员被跳过；全部锁定/无选中字段禁用；`data-multi-property` 分派不触碰单选通道 | ✅ 含锁定组件多选批量编辑，锁定组件不变、其余更新（单测覆盖；harness 用非锁定选择） |
| R5 质量 | ✅ 全部聚焦测试通过（交集/锁定/事务形状/撤销往返） | ✅ `pnpm verify:browser` 多选批量断言通过（宽度/字号/两次撤销逐级恢复） |
