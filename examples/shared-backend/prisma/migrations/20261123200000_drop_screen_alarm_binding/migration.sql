-- ADR-0110：宿主告警改走推送数据源，组件外观由文档里的组件状态决定，宿主不再按屏保存样式绑定。
-- 手写而非 `prisma migrate dev` 产物：只删掉这一张表，不改既有 Screen 列。

-- DropTable
DROP TABLE "ScreenAlarmBinding";
