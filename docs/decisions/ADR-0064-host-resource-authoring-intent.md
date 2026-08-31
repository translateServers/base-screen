# ADR-0064：宿主资源 Authoring Intent

> 状态：已接受
> 日期：2026-08-30
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0062](./ADR-0062-host-left-panel-groups.md)

## 背景

宿主需要在自有资源目录中完成搜索、权限、缩略图和分页，并把一个已选择资源插入设计器或替换
同类型组件。旧 `ScreenAssetCatalogPort` 把素材搜索、删除检查和 `props.source` 约定放进 Engine，既与
宿主资产所有权冲突，也不能统一图片、GIS、拓扑等资源身份。

## 决策

1. 资源目录 UI 只通过 `leftPanelGroups` 命名 slot 挂载，内容、状态和请求生命周期全部归宿主；
   Base Screen 不建立资源目录、Store 或通用网络客户端。
2. 宿主只提交严格 JSON-safe 的 `BaseScreenHostResourceAuthoringIntent`：`materialType`、canonical
   `ScreenHostResourceDataSource` 和可选有界 `name`。未知字段、URL、token、header 以及超过 8 KiB
   的载荷失败关闭。
3. Designer 提供 `insertHostResource` 与 `replaceHostResource`。插入根据 catalog Manifest 生成默认
   尺寸、props、style、ID 和 zIndex；替换要求组件 type 完全相同且只 patch `dataSource`。两者均以
   单次 Core transaction 提交。
4. 宿主拖放使用固定 MIME；Engine 在 dragover 正文可读时重新解析，浏览器保护正文时仅接纳 MIME
   候选，drop 必须重新解析，并校验 material catalog、
   `host-resource` capability、资源类型贡献和 canonical dataSource。非法载荷忽略并派发稳定诊断。
5. 删除 `ScreenAssetCatalogPort`、`ScreenAssetSummary`、`capabilities.assets`、`assetCatalogPort`、
   `listAssets()` 和内置素材控制器。资源管理与删除保护继续由宿主实现。

## 结果

- ScreenDocument 中的资源身份只有 `dataSource.resourceType/resourceId`，签名 URL 不进入 authoring
  intent、拖拽载荷或文档。
- catalog 仍是实例内可插入物料的唯一权威，宿主市场/订阅过滤后的 catalog 自动约束资源操作。
- 这是探索阶段的破坏性公共 API 切换；旧素材端口不提供兼容层。
