-- 设计器临时上传：素材可绑定当前大屏并在过期后回收（公共素材保持 temporary=false）。
-- 手写而非 `prisma migrate dev` 产物：只新增可空列/默认值列与索引，不改既有列。
ALTER TABLE "Asset" ADD COLUMN "temporary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN "screenId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "expiresAt" DATETIME;

CREATE INDEX "Asset_screenId_idx" ON "Asset"("screenId");
CREATE INDEX "Asset_expiresAt_idx" ON "Asset"("expiresAt");
