# Designer Authoring And Project Lifecycle 验收清单

> 状态：已归档；勾选项记录归档时的历史验收快照，不自动迁移到现行清单
> 现行验收：[Designer Engine 验收清单](../designer-engine/checklist.md)

## 文档与前置决策

- [ ] Project Lifecycle ADR 已接受并冻结 publish、signal、conflict、retry 和 baseline。
- [ ] Contracts Foundation、Core Domain 与 Designer Engine Spec 已同步公共契约变化。
- [ ] 本 Spec 状态为“生效中”，R1-R11 均映射到 Task 与自动化测试。
- [ ] `groupMaterialType`、direct-document baseline 和 save pending edit 语义无待定项。
- [ ] Nebula Designer parity provenance 记录了参考 commit/path、许可未知和 no-copy 结论。
- [ ] 实现没有复制 Nebula TypeScript/JSX/CSS/config/SVG/font/screenshot/test asset。

## 所有权边界

- [ ] Contracts 变更只涉及 Project Adapter/result/diagnostics，不改 runtime ports 或 Blueprint。
- [ ] Core 只提供纯 transaction/interaction/geometry/hierarchy，不访问 DOM 或 adapter。
- [ ] Engine 独占 Designer session、history、clipboard、project controller、parity shell 和 Blueprint authoring UI。
- [ ] Engine 只消费 Material Catalog/Manifest 与 Renderer，不复制其 parser/runtime。
- [ ] 本实施未修改 sandbox、Host Resource、Blueprint schema/compiler/runtime、plugin contribution、bridge 或 importer。

## Project Adapter

- [x] load/save request 带 abort signal，publish request 只带 projectId/revision/signal。
- [x] adapter capability 与 publish method 必须一致，不一致在绑定时 fail closed。
- [x] 所有成功 response 在应用前重新解析 Envelope 和 canonical document。
- [x] revision 保持 opaque，不 trim、推算、自增或从 document 生成。
- [x] Adapter/context 不包含 Router、Store、credential、endpoint 或 UI callback。
- [x] throw/rejection 归一为固定最小披露 diagnostic，不回显 Error/stack/payload。

## Project Controller

- [x] 状态只允许 unloaded/loading/ready/saving/publishing/conflict/error/disposed 合法转换。
- [x] 每个 operation 有独立 generation/controller/submitted snapshot。
- [x] 新 load 中止旧 load，save/publish mutation 不并发。
- [x] replace/unload/disconnect/dispose 中止 pending operation 并清理 retry timer。
- [x] 迟到 response 通过 signal/generation/projectId/revision guard 后才可应用。
- [x] cancel 幂等且不派发 success、不推进 revision/baseline、不显示普通 error。
- [x] 同 snapshot 重复 save 共享 in-flight Promise，document 改变后不错误复用。

## Baseline、Conflict 与 Retry

- [x] load/direct replace 建立 canonical baseline，初始 dirty=false。
- [x] edit 离开 baseline 发 dirty=true，undo/redo 回 baseline 发 dirty=false。
- [x] dirty 没有变化时不重复派发事件。
- [x] save pending 期间编辑不会被 response 覆盖，current document 相对新 baseline 保持 dirty。
- [x] persistence response 不写用户 history；server normalization 遵守 submitted snapshot guard。
- [x] dirty 时 publish 返回 `PROJECT_DIRTY`，不隐式 save。
- [x] conflict 保留 document/history/selection/revision/baseline，并只提供 reload/continue。
- [x] reload dirty project 需要 discard confirmation；continue 不伪造新 revision。
- [x] load 只对 unavailable 自动 retry 两次；save/publish/conflict/auth/validation 不自动 retry。
- [x] retry timer 属于当前 generation，可由 fake scheduler 确定性测试。

## Selection 与 Marquee

- [ ] click、blank clear、Shift/Ctrl/Cmd toggle 与 focused selection 行为符合 Spec。
- [ ] marquee 支持 intersect/contain 和 replace/union 模式。
- [ ] hidden component 不可选，locked component 只可从 Layers 选择查看。
- [ ] selection 只存于 Core interaction state，不存在 canvas/Layers 副本漂移。
- [ ] document change/undo/redo 后 selection/focus canonical reconcile。
- [ ] 双实例 selection、focus、marquee 和 gesture 完全隔离。

## Resize、Rotate 与手势

- [ ] 单选显示 8 resize handles 和 1 rotate handle，多选显示 selection bounds handles。
- [ ] resize/rotate UI、pointer 和 command 同时遵守 Manifest capability 与 effective locked。
- [ ] Shift/Alt resize、15 度 rotate snap 和角度规范化符合 Spec。
- [ ] 多选 transform 保持相对几何，所有结果 finite 且满足 canonical geometry。
- [ ] pointer move 只更新 transient preview，pointerup 只提交一个 transaction/history entry。
- [ ] pointercancel/lost capture/blur/tool change/replace/unload/disconnect 恢复 gesture baseline。

## Group、Reparent 与布局

- [ ] Group 只使用显式、已启用、children=true 的 `groupMaterialType`。
- [ ] 无合法 group Material 时命令 disabled，不创建 synthetic/fallback component。
- [ ] group/ungroup/reparent 保持画布视觉位置和合法 parent tree。
- [ ] cycle、locked/hidden 非法 mutation 和不兼容 parent 由 Core fail closed。
- [ ] 六种 alignment 与两种 distribution 复用 Core geometry，不复制算法。
- [ ] locked component 按 Core 规则固定/作为 reference，少于规定数量时命令 disabled。
- [ ] 每个 group/ungroup/reparent/align/distribute 高层操作只产生一个 history entry。

## Layers 与 Clipboard

- [ ] Layers tree 来自 canonical hierarchy/painter order，展示 name/type/hidden/locked。
- [ ] Layers/canvas selection 双向同步，支持 rename/status/reorder/drag reparent。
- [ ] Layers 搜索只过滤视图，不改变 document order 或 selection。
- [ ] clipboard 是 Designer 实例内存，不使用系统 Clipboard API 或跨实例共享。
- [ ] copy detached clone 完整 selection subtree；paste 生成唯一 id 并重写 parent 引用。
- [ ] 连续 paste 按 20 x 20 偏移，project replace/unload/dispose 清空 clipboard。
- [ ] clipboard 不包含 history/selection/runtime/project revision/baseline/pending operation。

## Manifest Property Panel

- [ ] 通用 geometry/status 字段与 Material props 字段所有权清晰。
- [ ] props 控件只来自 Manifest propertyPanel/propsSchema 白名单。
- [ ] select 只绑定 enum schema；control/schema 不兼容显示 deterministic diagnostic。
- [ ] 提交前验证完整 next props；非法 draft 不改 document/history/Renderer。
- [ ] 成功 property edit 只提交一个 command/history entry。
- [ ] 多选只编辑兼容通用字段，不猜测或合并异构 Material props。
- [ ] Panel 不接受 React/Vue renderer、HTML、callback 或第二份 validator/default。

## UI、History 与隔离

- [ ] Toolbar、Material/Layers tabs、canvas overlay、Property 和 project status panel 状态一致。
- [ ] unavailable command 明确 disabled，并有可访问名称/tooltip。
- [ ] keyboard shortcut 不劫持 input/textarea/contenteditable。
- [ ] `executeTransaction()` 在 Core/Renderer 任一失败时保留原 document/history/selection/DOM。
- [ ] undo/redo 刷新 dirty、selection、Layers、Property 并取消 active gesture。
- [ ] conflict/error panel 不卸载 Designer，不清空 history/selection。
- [ ] 两个 Designer 不共享 history、clipboard、adapter operation、revision、baseline 或 UI state。

## Nebula-compatible Shell

- [ ] Toolbar 48px、Status 28px、Rulers 20px、panel handle 4px，desktop geometry 误差不超过 1px。
- [ ] Left panel 默认 240px、范围 200..400px、折叠 48px。
- [ ] Right panel 默认 288px、范围 240..480px、折叠 48px。
- [ ] panel/layout preference 是实例状态，不进入 document/history，也不隐式访问 localStorage。
- [ ] light/dark 使用 Base Screen 自有 token，视觉方向接近 Nebula 且不是复制其 CSS/theme config。
- [ ] 默认字体只引用 host/system stack，不把 Nebula 或第三方字体文件打入 package。
- [ ] 圆角不超过 8px，页面分区不使用嵌套装饰卡片，文本/图标无重叠或截断。
- [ ] icon/symbol 为 Base Screen 独立资产，命令有 tooltip、accessible name 和稳定 disabled/busy 状态。
- [ ] 小于 1024x640 显示不可编辑 warning，dialog 不溢出且 element 不抛 runtime error。

## Nebula-compatible Viewport 与 Tools

- [ ] Designer zoom 限制为 10%..500%，支持 cursor anchor、fit 30px、100% reset 和 zoom tool。
- [ ] pan、Space temporary Hand、window blur cleanup 与 tool restore 行为确定。
- [ ] 20px rulers、draggable guides、24px grid、grid snap 和 5px smart guides 可独立开关。
- [ ] viewport/guides/grid/smart-guide/layout 不进入 canonical document/history。
- [ ] Select(V)、Hand(H)、Text(T)、Rectangle(R)、Ellipse(E)、Image(I)、Zoom(Z) 来自单一 registry。
- [ ] create tool 只使用显式 `toolMaterialTypes` 和已启用 Material capability，无 fallback type。
- [ ] 小于 4px create drag 取消；Text/shape/image 的 click/drag create 各只产生一个 history entry。
- [ ] Alt-drag duplicate、select-all 排除 hidden/locked、group enter 和 layered Escape 符合 Spec。
- [ ] Designer history limit 为 50，viewport/layout/clipboard/runtime override 不进入 history。

## Nebula-compatible Panels 与 Integration

- [ ] 左 panel 提供 Materials/Layers tabs、component count、tree collapse、rename/status/order/group context commands。
- [ ] 50 个以内允许 Layers drag sort；更大集合仍可通过稳定命令完成排序。
- [ ] 右 panel 提供 Appearance/Data/Interaction/Events tabs；无 selection 时显示 Canvas settings。
- [ ] Data 只编辑 static/host-resource，不出现 API/dataset/header/credential/request-test 字段。
- [ ] Interaction 控制 design/interaction mode；Events 显示 rule 摘要和 Open Blueprint 入口。
- [ ] JSON 编辑使用 Base Screen 自有 JSON boundary，不把 Monaco 作为 package 依赖。
- [ ] project preview request 只引用最近保存 projectId/revision，不把 unsaved document 当作 saved preview。
- [ ] direct document Viewer preview 退出后恢复 authoring viewport/selection。
- [ ] canonical JSON import 在确认后以一个 transaction 替换；legacy Nebula 文件不绕过 importer。
- [ ] shortcut registry 按 global/canvas/blueprint scope 仲裁，输入控件保留原生文本快捷键。

## Blueprint Authoring Parity

- [ ] Blueprint UI 只消费 Runtime Spec parser/compiler/fake runtime，不复制 evaluator 或 host action。
- [ ] authoring projection 支持 trigger/condition/action/annotation，不形成第二份 runtime truth。
- [ ] 提供 search insertion、connection validation、25%..200% zoom、fit、minimap 和 selection。
- [ ] 提供 align/distribute、node config、diagnostics、simulation log、context menu 和 component locate/filter。
- [ ] canonical contract 不含 layout 时使用 deterministic auto-layout，不写私有 node position 字段。
- [ ] Runtime capability 缺失时 Blueprint control disabled，不猜测 schema 或 fallback。
- [ ] Nebula 的 API/dataset/requestApi/dynamic variables/template/route/auth 能力没有进入 Base Screen runtime。

## Visual Parity Gates

- [ ] 1024x640、1440x900、1920x1080 无 body scroll、异常 overlap 或父容器溢出。
- [ ] 1440x900 light/dark shell 自有 golden 的 `maxDiffPixelRatio <= 0.005`。
- [ ] Materials/Layers/transform/Property/Canvas/context/conflict/preview workflow 几何误差 <=2px、diff <=0.01。
- [ ] Blueprint empty/populated/config/diagnostics/log/search/context screenshot diff <=0.01。
- [ ] 390x844、768x1024 warning/dialog containment 通过；Viewer 390x844、412x915 无 body overflow。
- [ ] 动画在 screenshot 时关闭，fixture/document/id/data 确定，时间字段被 mask。
- [ ] Nebula 对比截图只用于本地审计且不提交；仓库只包含 Base Screen 自有 goldens/数值证据。

## 测试与质量门

- [x] Project controller 的 generation/abort/race/retry/conflict/baseline 有 Vitest 分支测试。
- [ ] Core transaction/selection/geometry/hierarchy 的新增业务约束有纯函数测试。
- [ ] 独立 Designer Playwright 覆盖 pointer、marquee、handles、Layers、keyboard 和 project races。
- [ ] Designer Playwright 覆盖 P0-P2 parity shell、viewport/tools、panels、Blueprint 和 preview workflow。
- [ ] Designer harness 不承担 sandbox/resource/framework/importer 测试。
- [ ] diagnostics 与测试产物不包含 canary secret、Document、adapter Error 或 stack。
- [x] 受影响 package format/lint/typecheck/test/build 全部通过。
- [x] API report、publint、ATTW、tarball、browser verification 与 `pnpm verify:m0` 全部通过。
