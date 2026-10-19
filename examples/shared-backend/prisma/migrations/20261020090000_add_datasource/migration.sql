-- 数据源台账表（PRD §8.1）。手写而非 `prisma migrate dev` 的产物：本次只新增一张表，
-- 不改动既有 `Screen` 表（乐观锁与文档列一个字节都不动），手写 SQL 与 `migrate deploy` 完全兼容，
-- 并且在「空库直接 deploy」的验收路径上不依赖开发库的历史状态。

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastTest" TEXT,
    "fields" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_datasetId_key" ON "DataSource"("datasetId");

-- CreateIndex
CREATE INDEX "DataSource_type_idx" ON "DataSource"("type");

-- CreateIndex
CREATE INDEX "DataSource_status_idx" ON "DataSource"("status");
