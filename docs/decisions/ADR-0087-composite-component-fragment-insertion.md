# ADR-0087: 组合分片的插入入口与预设所有权

> 状态：已接受
> 日期：2026-10-04
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)（轻量基座与宿主处理边界）、
> [ADR-0086](./ADR-0086-material-state-and-surface-ownership.md)（物料状态呈现与盒面样式的单一归属）、
> [ADR-0078](./ADR-0078-material-library-presentation.md)（物料库可见性）、
> [ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)（物料 ABI 与注册）

## 背景

物料原子化约定要求「一个物料只做一件事，需要标题时由文档层另放一个 `base.text`」。这条约定
的直接后果是：**一张卡片天然是多节点组合**，而不是一个物料。

组合此前只有编辑期的一半。`base.container` 加公开配置 `groupMaterialType` 之后，成组/解组/
reparent/组缩放/组旋转/派生包围盒/子树复制粘贴/锁定隐藏继承都已存在；缺的是复用期——宿主想
用代码插入一份组合，唯一合规入口 `insertComponent` 一次只能建**一个**节点，且只按 manifest
默认值，不接受 `props`/`style`。该方法的注释自己点明了这个缺口：「自动化测试、AI 生成大屏、
模板实例化都没有合规入口」。

缺口的代价是可观察的：`harness/browser-harness` 的 DataV 案例要为 8 个节点写两轮调用——先
`insertComponent` 建节点，再 `update-components` 覆盖位置、尺寸与 props，于是撤销一次只回退
一个节点；宿主侧要覆盖 props 还必须自己把 schema 必填字段全部重新展开一遍（`patch` 按顶层键
整体替换），漏一个就在提交时被拒。另一条路——驱动私有拖放 MIME——被文档明确禁止。

坐标模型也不站在"组合"这边：文档是扁平 `components[]` 由 `parentId` 连接的树，而父子关系
**不引入局部坐标系**（`validate-semantics` 有断言，渲染器把所有元素按画布绝对坐标平铺）。所以
组合无法靠"子节点相对父级定位"来表达，必须自带一套偏移。

## 决策

1. **基座提供一次展开的组合插入入口。** `<base-screen-designer>` 新增公开方法
   `insertComponentFragment(intent)`，一次插入一组带相对偏移的原子节点，提交为**一个**可撤销
   事务。
2. **它是 authoring intent，不进 `@base-screen/contracts`。** 分片描述不是 canonical 文档形态、
   没有规范序列化，与既有的 `BaseScreenComponentInsertionIntent` 同构，因此解析与构建落在
   `engine/common/operations/material-component/`。诊断码复用既有 `AUTHORING_PAYLOAD_INVALID` /
   `AUTHORING_SOURCE_INVALID` / `AUTHORING_LIMIT_EXCEEDED`，不新增码——加一个码就是契约公共 API
   变更。黄金产物 `screen-document.schema.json` 不变。
3. **预设的存储与检索归宿主，基座不持有预设注册表。** 不新增「区块 / 模板 / 组合」一等实体，
   也不提供 `configure` 级的预设目录：那会引入注册表生命周期（失效、与 catalog 重建联动、多实例
   一致性），而预设本质是宿主的业务内容（品牌、物料偏好），与归档调研对「数据包」的同型结论一致。
   基座改为公开导出 `parseBaseScreenComponentFragmentInsertionIntent`，让宿主在写入自己的存储前
   先跑同一个失败关闭解析器。
4. **分片用相对 anchor 的偏移，整片只平移。** 节点位置是相对 anchor 的偏移；先按偏移建出临时
   节点并对包围盒求并集，再把并集左上角对齐 anchor 后贴进画布。**不得**逐节点裁剪——那会把
   组合拉开变形。分片整体大于画布时失败关闭，而不是缩放。这条规则是坐标模型（绝对、无局部
   空间）的直接推论。
5. **shell 的校验按 `designCapabilities.children`，不按 `libraryVisible`。** 唯一的装饰容器
   `base.container` 是 `libraryVisible: false`：不可从物料库插入，但可作为编组壳与层板 reparent
   目标——该边界已由 [Material Library Visibility](../specs/archive/material-library-visibility/spec.md)
   R2 与 ADR-0078 确立，Group 命令用的就是这一条。分片的 shell 沿用同一规则，普通节点继续走
   `validateInsertableMaterial` 的库可见性检查。**契约没有放宽**：两条既有规则各自用在对的地方，
   shell 是结构槽位而不是库插入。
6. **`props`/`style` 与 manifest 默认值顶层浅合并后再过 schema。** 这是对 `insertComponent`
   「只按默认值建节点，改值请插入后再 patch」边界的定点补齐：合并语义消除了"宿主必须自己展开
   必填字段"这一类踩坑。合并只发生在分片入口，`insertComponent` 与 `update-components` 的既有
   整体替换语义不变，两者适用场景由文档区分。
7. **id 与 zIndex 在分片内本地去重。** 一次事务提交前文档未变化，按文档现状推导会让同类型的
   第二个节点拿到与第一个相同的 id（`add-component` 随即拒绝），zIndex 也会全部相同。分片维护
   本地 reserved 集，zIndex 从文档当前最大值起按声明序递增。
8. **规模有界**：节点 ≤ 64、intent 序列化 ≤ 64 KiB，超限 `AUTHORING_LIMIT_EXCEEDED`；循环引用与
   函数在体积守卫处失败而不是序列化时抛出。父级引用只接受 shell 键或**更早声明**的节点键，由
   声明顺序排除环，不依赖下游校验兜底。

## 后果

- 组合有了合规入口：一次调用、一次撤销、不需要 insert 之后再 patch 一遍。宿主自建区块面板时，
  基座侧只需存一段 JSON 并递进来。
- 示例回到约定的正面示范：`examples/host-api` 的起始文档里那张卡片由 `base.container` 底座 +
  `base.text` 标题 + `base.rule` 分隔线 + 宿主自有读数组合而成；宿主自有物料由「指标卡」更名为
  「指标读数」（`host-app.metric-value`），尺寸收到贴合读数的形态——它本来就只画数值与单位，
  名字和 260×120 的默认尺寸在暗示它是一个卡片，这是误导。三个前端同时补 `groupMaterialType`，
  使编辑期的成组在示例里真正可用。
- 需要维护的多了：一套 intent 解析、一份包围盒平移计算、分片内的 id/zIndex 记账。
- **shell 的几何不受作者持有**：宿主配置 `groupMaterialType` 后，组壳由引擎吸附到其子孙的包围盒并集
  （auto-width 文本的实测宽度变化根本不产生事务，只能靠下一次事务顺带同步，所以这条派生是无条件的）。
  因此"带内缩留白的卡片底座"不能作为 shell，应作为平级 `base.rectangle` 节点；shell 表达的是结构父级
  （锁定/隐藏继承与绘制顺序），不是画框。示例起始文档按此写成四个根节点叠加。
- 语义要读文档才不困惑：`insertComponent` 的 `position` 是**节点**左上角，分片的 `anchor` 是
  **组合包围盒**左上角；单节点时两者一致，组合时不同。
- 明确不做：不给 manifest 加 `children`/`slot`、不让物料渲染另一个物料（原子化约定与坐标模型
  都不允许）；不做 flex/grid 布局容器与相对父级坐标；分片不带旋转与缩放。需要这些的场景仍归
  宿主，或另立决策。
- 遗留：`plugin-datav-materials` 案例继续走 insert + patch 两轮——它同时覆盖 `update-components`
  能力，合并反而减少覆盖面。
