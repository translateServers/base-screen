-- 在线物料包（ADR-0090）：只存储宿主审核后的 ESM 代码与 Manifest，不执行。
CREATE TABLE "MaterialPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "manifest" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MaterialPackage_type_key" ON "MaterialPackage"("type");
CREATE INDEX "MaterialPackage_updatedAt_idx" ON "MaterialPackage"("updatedAt");
