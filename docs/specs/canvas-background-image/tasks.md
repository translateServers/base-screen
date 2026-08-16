# Canvas Background Image Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿，含 R5 面板编辑增量）

- [x] Task 1：冻结 ADR-0043 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md「生效中」）、ADR 索引
      （docs/decisions/README.md）与基线 README 能力行。
- [x] Task 2：contracts 契约与解析：`ScreenCanvas` 增加可选 `backgroundImage?: string` 与
      `backgroundImageFit?: 'cover' | 'contain'`，导出 `ScreenCanvasBackgroundImageFit`；
      `canvasSchema` 增加可选字段；`limits.ts` 增加 `MAX_BACKGROUND_IMAGE_CODE_POINTS = 2048`；
      `validate.ts` 的 `CANVAS_FIELDS` 白名单扩展并新增失败关闭的 `backgroundImage` 校验（码点长度/
      控制字符/空白/反斜杠/scheme 白名单与边界形式）与 fit 枚举（R1）；有界 URL 判定收敛为 contracts
      共享的 `isBoundedScreenImageUrl`，plugin-core 封面校验复用同一规则（行为不变，54 测试回归通过）。
- [x] Task 3：contracts 测试与 golden schema：合法 http(s)/根相对/点相对/协议相对/query-hash/恰好
      2048 码点通过且保留；非字符串、超长、含空白、C0/C1 控制字符、反斜杠、`data:`/`javascript:`/
      `blob:`/`file:`/`ftp:`、裸相对路径与边界形式拒绝（路径 `canvas.backgroundImage`）；fit 枚举；
      未知字段拒绝语义不变；序列化往返保留；`json-schema.test.ts` 断言两可选字段；
      `pnpm --filter @base-screen/contracts build` 后 `node scripts/emit-schema-golden.mjs` 再生成
      黄金产物并提交（R1）。
- [x] Task 4：core `update-canvas`：`CANVAS_FIELDS` 扩展（apply.ts）；patch 值 `null` 删除字段语义
      （null 不进入最终文档）；新增 `ScreenCanvasPatch` 类型并导出；测试覆盖——patch 成功、非法
      URL/fit 失败零副作用、null 删除、空/相等 patch no-op、未知字段拒绝（R2）。
- [x] Task 5：renderer 画布背景渲染：`render()` 设置/清除 root 的 background-image（CSS 值转义
      `\` 与 `"`）/size（cover/contain，缺省 cover）/position center/repeat no-repeat；无图时清除；
      backgroundColor 语义不变；测试覆盖设值、fit 映射、清除、转义、非法文档失败（R3）。
- [x] Task 6：engine 宿主 API：`BaseScreenDesignerElement.setCanvasBackgroundImage(backgroundImage:
      string | null, fit?: ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>`，经
      session 事务（update-canvas）提交；测试覆盖——事务形状、null 清除同时清 fit、未传 fit 保留
      既有 fit、无文档失败、非法值零副作用（session 集成：文档更新/dirty/history/变更事件）
      （R4）。
- [x] Task 7：文档同步：usage.md 第 7 节登记 `setCanvasBackgroundImage` 用法、文档字段与校验边界；
      `pnpm verify:browser` 作为回归验证通过（本增量不新增 harness 探针：`scripts/verify-browser-harness.mjs`
      正由并行的 ADR-0042 会话占用；背景渲染由 renderer/session/element 聚焦测试覆盖）（R1-R4）。
- [x] Task 8：质量门禁：contracts（141）/core（121）/renderer（23）/engine（442）聚焦测试通过；
      engine lint/typecheck/test 通过（含预先存在的 panel 测试 `vi.fn` 类型错误修复——
      9704137 引入，与 ADR-0042 并行会话环境相关）；`pnpm verify:m0` 与 `pnpm verify:browser`
      全部通过；测试矩阵与实现一致（R1-R4）。
- [x] Task 9：ADR-0045 已接受并互注 ADR-0043；Spec 增补 R5（属性面板画布背景图控件）、非目标修订
      与完成定义更新；ADR 索引登记 ADR-0045（R5 文档门禁）。
- [x] Task 10：属性面板实现：`designer-ui-text.ts` 增加「背景图片」「适配方式」文案；`appendCanvasControls`
      增加 backgroundImage 文本输入与 backgroundImageFit 下拉（无背景图禁用、未声明显示 cover）；
      `createCanvasTransaction` 支持 backgroundImage（非空提交、清空提交 null 删除并清 fit）与
      backgroundImageFit（枚举提交）；仅用既有 designer-control 样式（R5）。
- [x] Task 11：属性面板测试：画布区控件渲染（输入/下拉/禁用态/顺序/有图状态）；URL 设置、清空删除
      （同时清 fit）、fit 变更的事务形状；非法 fit 构建层拒绝；非法 URL 经事务失败关闭（诊断通道、
      零副作用）；既有 canvas 输入断言更新为含 backgroundImage（R5）。
- [x] Task 12：质量门禁：engine lint/typecheck/test（448）通过；`pnpm verify:m0` 与
      `pnpm verify:browser` 全部通过；测试矩阵与实现一致（R1-R5）。
