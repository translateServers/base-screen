-- L3 隔离代码物料的发布签名（ADR-0117 D11）：contentHash / reviewer / model / promptHash /
-- signedAt / signature 的 JSON，非 L3 物料为 null。
-- 手写而非 `prisma migrate dev` 产物：只新增可空列，不改既有列。
ALTER TABLE "MaterialPackage" ADD COLUMN "attestation" TEXT;
