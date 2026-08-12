# Material Library Host State Checklist

> 状态：已完成

- [x] 状态投影严格拒绝未知字段、非法状态、失败数量、重复/越界/非法 type。
- [x] 未配置状态的既有宿主保持兼容，显式状态显示稳定状态条和适用动作。
- [x] 分类稳定排序，搜索覆盖名称、type、分类，筛选无结果有空态。
- [x] 草稿和不可用标记不进入 Manifest/Document；不可用物料不能创建或拖拽。
- [x] retry、reload、details 只发 composed 宿主事件，不联网、不替换 catalog。
- [x] 状态更新不重建 Renderer，catalog 更新仍要求 unload/reconfigure。
- [x] 用户文案集中、键盘与可访问状态完整，加载/状态变化无布局抖动。
- [x] DOM、Element 与 browser 测试覆盖 ready/loading/offline/partial/error/update、筛选和动作。
- [x] API、boundary、build、tarball 与 `pnpm verify:m0` 通过。
