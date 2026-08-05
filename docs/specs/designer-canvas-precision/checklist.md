# Designer Canvas Precision 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 移动与历史

- [x] 单选和多选移动在手势期间只修改对应 Material 根元素的 CSS `translate`。
- [x] preview 不写 document、Renderer model 或 history，完成时只提交一次 absolute position transaction。
- [x] 取消、lost capture、blur、replace、unload、disconnect 和工具切换清理所有 translate 与 snap overlay。

## 吸附与坐标

- [x] 选区 bounds 的 left/center/right 和 top/middle/bottom 都可匹配候选并产生统一 delta。
- [x] 画布、网格、用户 guide、可见组件及旋转组件 visual bounds 均按既定优先级参与吸附。
- [x] 被移动组件不作为自己的候选；hidden 被排除，locked 仅作为候选且不可获得 mutation 权限。
- [x] pointer 与 guide 坐标换算复用统一 helper，并在非零 pan/10%–500% zoom 下保持确定性。

## 质量

- [ ] R1–R4 有当前 unit/DOM/browser 测试映射和反向标注。
- [ ] provenance、Engine format、lint、typecheck、test、build 与 `pnpm verify:m0` 通过。
