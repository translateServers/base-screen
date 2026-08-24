# ADR-0061：宿主受限可视化事件蓝图

> 状态：已接受
> 日期：2026-08-24
> 关联：[ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md)、[ADR-0026](./ADR-0026-designer-event-blueprint-authoring.md)、[ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)

## 背景

宿主需要让普通用户配置组件联动，同时避免把自由连线、任意脚本和图布局状态带入大屏文档。
既有 canonical Blueprint 已限定为“物料事件、可选条件、有序动作”，Core 也已提供编译、trace、运行时与
`replace-blueprint` 单事务，因此宿主可以把它投影为符合执行顺序的可视流程，而不增加第二套图模型。

## 决策

1. 宿主事件蓝图固定显示为“事件 → 可选条件 → 有序动作”的单向流程。左侧管理规则，中间展示执行流，
   右侧编辑当前节点，底部提供无副作用试运行；不提供任意连线、回路、脚本节点或隐藏控制流。
2. Material `editorDescriptor.events` 是可用事件、显示信息、payload 字段和 capability 的事实来源。
   新建规则只允许选择文档中真实组件已经声明且允许用于 Blueprint 的事件。
3. 普通表达式使用固定值、事件数据、变量、对象和数组的结构化控件；`host-action.actionId` 保持只读，
   新建动作只开放 `set-variable` 与 `emit-host-event`。条件、表达式和动作继续由 canonical parser/compile
   失败关闭校验。
4. 模拟只调用 Core compile/trace，不发送宿主事件、不调用 host action、不改变量、不写历史。应用经作者桥
   的 requestId、revision 和 component guard 提交完整 Blueprint，一次应用只形成一条历史记录。
5. 规则草稿、搜索、选中节点和视口只属于宿主编辑会话，不写入 ScreenDocument。取消、宿主重载和页面卸载
   调用 `cancelAuthoringEdit` 释放 pending request；未保存草稿关闭前必须确认。
6. 不引入图形库。若未来 canonical 语义增加并行、分支或循环，再按 ADR-0019 独立评估图内核；当前实现不为
   假想图能力增加文档字段或兼容层。

## 结果

- 复杂联动仍按真实执行顺序阅读，用户不需要理解图论或手写 JSON。
- Base Screen 继续拥有 canonical 契约、编译、trace、history 与会话守卫；宿主拥有产品级可视编辑体验。
- 本决策落实 ADR-0028 已授权的宿主图形作者路径，并取代 ADR-0026 对该宿主继续延后可视化的旧结论；
  ADR-0026 的 canonical 与运行时约束保持有效。
