-- 宿主自有物料由「指标卡」改为原子的「指标读数」：type 变了，存量文档里的节点必须同批改写，
-- 否则渲染期该节点因物料类型不在 catalog 中被剔除（卡片隐形），且隐形状态可能被自动保存固化回去。
--
-- 只改字符串：不动 revision、不删行、不改文档其余部分。`WHERE ... LIKE` 守卫使重复执行为空操作。
-- 后端仍不理解文档内部结构（canonical schema 归 @base-screen/contracts 所有），这里做的只是一次
-- 宿主侧的数据搬运，不引入读时兼容分支——那会变成第二份真相。

UPDATE "Screen"
SET "document" = replace("document", '"host-app.kpi-card"', '"host-app.metric-value"')
WHERE "document" LIKE '%host-app.kpi-card%';

-- 组件名是纯展示字段（层板列表里显示），随物料改名一并更新，避免留下「指标卡」的旧称呼。
UPDATE "Screen"
SET "document" = replace("document", '"CPU 指标卡"', '"CPU 读数"')
WHERE "document" LIKE '%"CPU 指标卡"%';
