# ADR-0060：物料库条目投影与运行物料身份分离

> 状态：已接受
> 日期：2026-08-23
> 关联：[ADR-0021](./ADR-0021-material-library-visibility.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0033](./ADR-0033-host-controlled-material-library-grouping.md)

## 背景

Material Catalog 的 `type` 是运行 ABI 身份，但宿主素材库、GIS 地图和拓扑图属于业务资源。
若为了在物料面板展示每个资源而复制 catalog entry，并生成 `xj.asset-image-<id>` 一类动态 type，
运行类型、资源身份和面板卡片会被错误合并，目录规模、兼容扫描和市场状态也随资源数量膨胀。

## 决策

1. Designer 增加可选、JSON-safe 的 `materialLibraryItems` 投影。每项包含稳定 `id`、一个
   canonical `materialType`，以及可选名称、分类、关键词、封面、实例初始值和
   `defaultDataSource` 覆盖。
2. 多个条目可以指向同一 `materialType`。点击或拖拽后写入 Screen Document 的仍是 catalog
   中的 canonical type；条目覆盖只决定新实例的名称、尺寸、props、style 和初始数据源。
3. 覆盖与 Manifest 默认 props/style 浅合并，再复用完整 Manifest 校验失败关闭；
   `defaultDataSource` 复用 Screen Document 数据源契约校验，并且必须被物料的
   `dataCapabilities` 接受。条目不得引用缺失或隐藏 type，并必须至少覆盖每个可见 catalog type 一次。
4. 未配置时自动投影为“一种可见物料一个同名条目”，现有 catalog、分组、状态和拖拽 MIME 保持兼容。
   分组仍按 `materialTypes` 工作，同类型的多个条目在该类型位置按宿主输入顺序展开。
5. 条目只属于当前 Designer 实例，不进入 Material Manifest、catalog、Renderer、Viewer、
   Screen Document 或持久化；资源查询、权限、签名 URL 和市场策略继续归宿主。

## 结果

- catalog 表达“如何运行”，物料库条目表达“面板里可选择什么”，业务资源身份进入实例
  `host-resource.resourceId`（兼容期可同时镜像在 props）。
- 素材、GIS、拓扑可复用稳定物料类型，不再为每个资源注册构造器或伪造动态 type。
- 既有宿主零迁移；需要资源卡片的宿主可逐步改用条目投影。
