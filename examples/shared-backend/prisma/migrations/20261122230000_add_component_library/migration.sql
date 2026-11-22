-- 组件库（ADR-0106）：原子组件草稿与组合。已发布的原子组件仍在 MaterialPackage。
CREATE TABLE "ComponentDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ComponentDraft_type_key" ON "ComponentDraft"("type");
CREATE INDEX "ComponentDraft_updatedAt_idx" ON "ComponentDraft"("updatedAt");

CREATE TABLE "ComponentFragment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ComponentFragment_updatedAt_idx" ON "ComponentFragment"("updatedAt");
