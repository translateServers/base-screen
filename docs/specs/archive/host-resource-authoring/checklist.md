# Host Resource Authoring Checklist

- [x] intent 严格、JSON-safe、最大 8 KiB，URL/token/header/未知字段被拒绝。
- [x] catalog、material capability、resource contribution 和 dataSource 均重新校验。
- [x] 插入与替换只经单次 Core transaction。
- [x] 替换不改变几何、样式、显示属性或名称。
- [x] Engine 不拥有宿主资源目录与资源请求状态。
- [x] 旧素材端口和内置素材控制器已删除。
- [x] 完整门禁与真实 tarball 验收通过（2026-08-31）。
- [x] 宿主资源 slot 传递可用高度，桌面/窄视口列表内部滚动，加载与切换不推动操作区。
- [x] 无字段绑定声明的宿主资源只显示来源摘要，不查询数据集目录；切换时取消未完成的数据集请求。
