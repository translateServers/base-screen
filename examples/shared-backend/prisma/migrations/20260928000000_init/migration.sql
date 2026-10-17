-- 初始 schema：大屏文档表。
-- 该文件由 `prisma migrate dev --name init` 的产物手工固化而来，内容与 prisma/schema.prisma 一致；
-- 后续变更应通过 `prisma migrate dev` 生成新的迁移目录，不要在此追加。

-- CreateTable
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
