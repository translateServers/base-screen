# Designer Product Completion 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

本清单全部按当前代码、自动化、当前 screenshot 和逐文件 provenance 重新验收。旧 Designer checklist、
Nebula 行为、单个 focused test 或历史 `verify:m0` 通过记录均不能替代未勾选项。

## 范围与来源

- [x] 唯一 Nebula 参考目录是冻结 commit 下的 `packages/screen-editor-core`。
- [x] `screen-sdk`、Web/NestJS 应用、其他 package 和宿主业务没有进入 requirements 或实现。
- [x] 用户授权、MIT 分发范围、排除目录和第三方内容边界已记录。
- [x] 每个当前直接改编的文档目标文件有 source commit/path、修改和 attribution 记录；后续实现文件仍须逐项追加。
- [x] 当前文档任务未使用来源字体、图标、截图、图片、上传内容、Tailwind 配置或第三方生成 UI 文件。
- [ ] bundle、`.d.ts`、source map、fixture 和 tarball 不含 Nebula 私有路径、模块或排除内容。

## 可信基线

- [x] 新任务不继承旧 Designer 或 archive checklist 的勾选状态。
- [x] Material、Renderer、Engine、browser harness 的实施前真实能力已有自动化 baseline。
- [x] 旧清单中真实物料、project preview、Blueprint 和视觉矩阵的过度声明已有明确 gap 映射。
- [x] 物料列表 event delegation、配置漂移和 direct preview 前置得到修复或确定性诊断。
- [x] Renderer root subtree painter order 符合 Core hierarchy。
- [x] 无关文档编辑不会重启未变化的 host-resource resolve。

## 外观公共契约

- [ ] Material appearance authoring successor ADR 已接受。
- [ ] Plugin Core Contract Spec 冻结 style schema/panel、control 和 validation 语义。
- [ ] Manifest 只包含声明数据，没有 UI callback、DOM、framework component 或 host object。
- [ ] props/style descriptor 的复用或区分有单一明确语义。
- [ ] `color`、number、enum、boolean、JSON 等适用控件有严格 parser 和资源预算。
- [ ] Plugin SDK builder、fixture、public declarations 和 API report 与当前 shape 一致。
- [ ] 私有阶段没有无需求的旧 shape 兼容分支或字段猜测。

## 官方物料

- [ ] 文本、矩形、椭圆、图片和容器均为真实官方 Material。
- [ ] 每个 Material 具有稳定 type/tagName、中文 Manifest、默认 props/style 和声明式字段。
- [ ] Designer 工具只映射已启用 Material，不使用文本 fallback 或 synthetic type。
- [ ] 文本内容和字体样式在 design/preview/viewer 中一致。
- [ ] 形状填充、边框和适用几何样式在 model 更新时不重建元素。
- [ ] 图片不持久化请求 URL/header/token 等 transport 配置，失败状态稳定可读。
- [ ] 容器 children、子树 painter order、group/reparent 和 Viewer 输出一致。
- [ ] 每个 Material 的 define 幂等、auto-register 精确且默认入口无副作用。
- [ ] idle/loading/ready/error data state 具有确定性 DOM 行为。
- [ ] 原生 Material conformance、事件和 disconnect/reconnect 测试通过。

## 外观检查器

- [ ] 画布、通用 geometry/status、Material props 和 Material style section 清楚分离。
- [ ] X/Y、宽高、rotation、zIndex、lock、hidden 和适用 opacity 使用统一字段结构。
- [ ] Material props/style 只来自 Manifest 白名单，不按 type 特判。
- [ ] text/number/select/boolean/color/JSON 控件都具有 label、accessible name 和 message 区域。
- [ ] draft 与 commit 分离，Enter/blur/change 每次只提交一个 operation/history entry。
- [ ] 非法 draft 同时具有 `aria-invalid` 和中文反馈，不改变 document/Renderer/history。
- [ ] 多选只显示兼容通用字段，不猜测异构 Material props/style。
- [ ] readonly 与 disabled 明确区分，输入法、文本选择和原生 undo/copy/paste 无回归。
- [ ] 长中文、enum、technical id 和数值不遮挡相邻控件或推动固定布局。

## 作者操作

- [ ] 在已选多选成员上 drag 不收缩 selection。
- [ ] 多选 drag 以一个 transaction/history entry 移动全部合法成员。
- [ ] undo/redo/select all/delete/Escape/方向键微调由 operation registry 提供。
- [ ] copy/paste/group/ungroup/align/distribute 的按钮、菜单和快捷键同源。
- [ ] shortcut label、tooltip 和帮助显示读取同一 metadata。
- [ ] locked/hidden/不同 parent/capability 不兼容时不产生部分 mutation。
- [ ] input/select/textarea/contenteditable/IME 不被全局快捷键劫持。
- [ ] 双实例 focus、shortcut、clipboard、active tool 和 gesture 完全隔离。

## 图层

- [ ] Layers 与 Canvas 使用同一 selection/focus 状态。
- [ ] click、Shift 和 Ctrl/Cmd modifier 行为与画布语义一致。
- [ ] 折叠和搜索不改变 canonical hierarchy 或 painter order。
- [ ] rename 的 Enter/blur 单次提交，Escape 取消且不写 history。
- [ ] 同级排序、合法 reparent 和拖回 root 均整体一次 undo。
- [ ] drop preview 只属于 Engine session，不作为 document 或 class state source。
- [ ] 循环、非法 parent、locked/hidden target 和不支持 children 确定性拒绝。
- [ ] hidden/locked/selected/focused/drop 状态具有非纯颜色信息。
- [ ] 大集合操作保持可用，性能阈值和自动化证据已记录。

## 画布精度

- [ ] 标尺刻度、标签和原点随 pan/zoom/device pixel ratio 更新。
- [ ] 参考线可创建、再次拖动、双击删除和拖出有效区删除。
- [ ] 画布边界/中心、网格、用户 guide 和可见组件边缘/中心均可作为 snap 候选。
- [ ] snap threshold 在 10%-500% zoom 下保持 screen pixel 语义。
- [ ] hidden component 不参与 snap，locked component 不因候选身份取得 mutation 权限。
- [ ] snap/guide preview 不进入 document/history，不改变 Material model。
- [ ] cancel、lost capture、blur、tool change、replace、unload、disconnect 清理 transient state。
- [ ] 两个 Designer 的 ruler、guide、grid、snap 和 viewport 互不影响。

## 工作台视觉

- [ ] token/base/controls/workbench 是唯一 Engine chrome CSS 层。
- [ ] 未引入来源 Tailwind class、品牌 palette、字体、第三方 UI primitive 或公共 stylesheet。
- [ ] 顶部命令区、工具栏、物料、图层、检查器、状态栏和 overlay 层级清楚一致。
- [ ] 新增控件复用稳定 primitive、variant、icon、tooltip 和 fixed size。
- [ ] empty/loading/error/disabled/busy/invalid/readonly/conflict 均有中文状态。
- [ ] dark/light 的文字、图标、边框、focus 和 semantic status 达到 WCAG AA。
- [ ] forced-colors 和 reduced-motion 下全部核心工作流可操作。
- [ ] 48/28/20/56px 固定区域和 240/288px 默认面板保持不变。
- [ ] 1024x640、1440x900、1920x1080 无 overlap、overflow、异常截断或失控留白。
- [ ] 窄屏只显示不可编辑提示，不泄漏工作台或新增移动编辑承诺。
- [ ] Material、Viewer、宿主和 sibling Designer computed style 不受 Engine selector/theme 污染。
- [ ] 当前 Base Screen screenshot 非空且通过人工视觉审查，未提交 Nebula screenshot。

## 数据与交互

- [ ] Data 只编辑 canonical static/host-resource，不出现 API、dataset、URL test 或 credential。
- [ ] resource type/params 在提交和 Host port 调用前通过 runtime contribution authority。
- [ ] official Materials 可见地处理 idle/loading/ready/error data state。
- [ ] 无关 geometry/style 编辑不重新发起资源请求。
- [ ] Interaction 只投影公开 design/preview capability，不创建私有 runtime state。
- [ ] 缺失 capability 时相关 UI absent/disabled，基础 authoring 可继续。
- [ ] resource failure/late result 不泄漏 URL、payload、Error、stack 或 credential。

## 事件与蓝图

- [ ] Events 展示 focused Material 已声明事件和相关 canonical rule。
- [ ] trigger event、rule add/remove/reorder 均通过 Core command/history。
- [ ] condition 和 value expression 使用当前 strict canonical shape。
- [ ] variable 与 host-event action 只使用已声明、宿主支持且获授权 capability。
- [ ] Core compile/evaluate diagnostic 映射固定中文摘要，不执行 host action。
- [ ] 未知、冲突、未授权或已撤销 capability fail closed，不执行部分 rule。
- [ ] 可选 graph layout 只属于 Engine session，不进入 document/history/export。
- [ ] 蓝图提供完整键盘编辑路径，不依赖 pointer-only graph。
- [ ] 没有 HTTP/navigation/script、React Flow shape 或来源 execution-log 私有字段。

## 隔离与可访问性

- [ ] 新增状态均有实例级明确所有者，DOM class/computed style 不成为领域真相。
- [ ] Designer/Material/Viewer/宿主和多实例状态、样式、事件完全隔离。
- [ ] 所有图标按钮有中文 tooltip 和 accessible name。
- [ ] tab、tree、dialog、menu、field 和 drag/drop 的键盘/focus 行为完整。
- [ ] focus-visible 不被裁切且不改变 box size。
- [ ] validation、warning、selected、drop target 不只依赖颜色。
- [ ] disconnect/dispose 清理 listener、pointer capture、timer、observer 和 pending operation。

## 自动化与质量门

- [ ] R1-R12 均映射到 Task 和具体 test file/case，反向映射完整。
- [ ] Plugin Core、Material、Core、Renderer、Engine 的 unit/DOM tests 覆盖新增分支。
- [ ] Designer Chromium 覆盖真实物料、外观、多选、快捷键、图层、画布、数据和蓝图工作流。
- [ ] 规定 viewport 的 geometry、contrast、overflow、containment 和 screenshot assertions 通过。
- [ ] provenance、排除目录、第三方许可和发布产物审计通过。
- [ ] 受影响 package format、lint、typecheck、test 和 build 全部通过。
- [ ] API、boundary、browser、runtime regression、tarball 和 no-side-effect checks 全部通过。
- [ ] `pnpm verify:m0` 通过且现行 Viewer、Plugin、bridge 和 importer 无回归。
- [ ] `tasks.md` 所有适用项有当前证据并已勾选，本 checklist 不存在未处理适用项。
