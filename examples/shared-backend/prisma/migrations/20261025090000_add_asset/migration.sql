-- 宿主素材库元数据（ADR-0089）。文件本体在 data/assets/，Screen Document 只存身份。
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Asset_createdAt_idx" ON "Asset"("createdAt");
