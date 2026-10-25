/** 在线物料包（ADR-0090）。代码与 Manifest 都由宿主生成/审核，后端只持久化。 */
export interface MaterialPackageShape {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly code: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialPackageReference {
  readonly id: string;
  readonly name: string;
}

export const ONLINE_MATERIAL_TYPE_PREFIX = 'host.online.';
export const MAX_MATERIAL_CODE_BYTES = 200 * 1024;
export const MAX_MATERIAL_MANIFEST_BYTES = 64 * 1024;
