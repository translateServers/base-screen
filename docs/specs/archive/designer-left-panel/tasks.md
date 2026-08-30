# Designer Left Panel Tasks

> 状态：已完成（2026-08-25；原封版 `pnpm verify:m0` 与 `pnpm verify:browser` 全绿，Task 12-13
> 以当前 `pnpm verify:m0` 与三宽度图层专项浏览器证据增量验收）

- [x] Task 1：冻结 ADR-0032 与 Spec 四件套，登记 Spec 索引与 ADR 索引（R1-R7）。
- [x] Task 2：扩展图标与文案：designer-icons 新增 eye/eye-off/lock/lock-open/arrow-up/arrow-down/
      chevron-left/right/down、star、layers、grid、search、x 与分类缩略图图标；designer-ui-text 新增
      清除搜索、添加物料、子项计数等文案键（R2-R5、R6 文案门禁）。
- [x] Task 3：物料库 DOM 重构：新增 designer-material-library-dom.ts（分类图标/色相映射、卡片网格构建、
      状态投影渲染迁移）；designer-workspace.ts 轨道结构改为面板头 + sticky Tab + 每 Tab 工具栏，
      卡片网格与折叠图标轨（R1、R2、R4）。
- [x] Task 4：面板控制器交互：搜索清除按钮与 Escape 清空、卡片网格方向键 roving focus、Enter 控件级
      添加；筛选/分类/收藏/状态动作契约保持（R3）。
- [x] Task 5：工作台控制器折叠轨：折叠态点击图标 Tab 展开并切换；Tab 状态与 ARIA 保持（R4）。
- [x] Task 6：图层树 DOM 增强：缩进引导线变量、图标化隐藏/锁定/上下移按钮、hover 显示、子项计数；
      全部既有契约与键盘/拖拽行为保持（R5）。
- [x] Task 7：样式重构：designer-base.css 与 designer-workbench.css 的轨道布局、卡片网格、chips、
      分段控件、图标轨、图层行与无抖动规约（稳定滚动条轨道、hover 无几何变化）（R1、R2、R5、R7）。
- [x] Task 8：单元测试更新与新增：workspace/物料库/图层 DOM/面板控制器/工作台控制器测试覆盖新行为，
      保持既有断言语义（R2-R5、R7）。
- [x] Task 9：verify-browser-harness 断言扩展：网格几何、折叠轨、键盘导航、无抖动与截图；
      跑通 `pnpm verify:browser`（R1-R5、R7）。
- [x] Task 10：质量门禁与文档同步：engine lint/typecheck/test、`pnpm verify:m0` 通过；
      基线 README 登记「左侧面板重构」增量，路线图当前生效 Spec 行更新（R6、R7）。
- [x] Task 11：DataV 图层管理细化：图层列表改为前层在上，增加置顶/上移/下移/置底/编组/取消编组
      工具栏与定位入口；修复名称命中误触操作、隐藏 Tab 截获点击，并以多选重排单测和真实浏览器
      事务/定位/无抖动断言完成回归（R5、R7）。
- [x] Task 12：统一图层行的视觉选择面与实际点击面：非隐藏图层除独立操作控件外支持整行选择，
      保留锁定图层可选中但不可拖拽/重命名的语义；选中底色、左侧强调轨与键盘焦点环覆盖完整
      36px 行，并以控制器/DOM/样式单测和三种桌面宽度真实浏览器断言完成回归（R5、R7）。
- [x] Task 13：修复图层首次单击触发同步重绘后浏览器无法合成原生双击的问题：以同图层、主键、
      无修饰键和系统 click detail/500ms 窗口跨节点识别真实双击；输入框立即聚焦，Enter 提交名称，
      并覆盖直接 dblclick、跨重绘双击、非指针 click 与真实 Chromium 双击提交（R5、R7）。
