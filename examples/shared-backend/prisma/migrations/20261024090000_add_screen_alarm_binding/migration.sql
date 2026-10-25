-- 宿主侧按屏告警绑定。与屏幕文档解耦：文档仍是零告警知识的 canonical JSON，
-- 这张表只保存宿主自己的 key → 组件 → 等级 → 样式映射，页面内可编辑。
-- 手写而非 `prisma migrate dev` 产物：只新增一张表与一条级联外键，不改既有 Screen 列。

-- CreateTable
CREATE TABLE "ScreenAlarmBinding" (
    "screenId" TEXT NOT NULL PRIMARY KEY,
    "config" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScreenAlarmBinding_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
