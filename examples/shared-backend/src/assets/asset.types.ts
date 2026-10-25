/**
 * 宿主素材库契约（ADR-0089）。
 *
 * Screen Document 只存 `resourceType` + `resourceId`；`contentPath` 只用于宿主自己的
 * 列表与解析，不写进文档。前端把 `contentPath` 拼到自己的 API Base 上。
 */
export const HOST_ASSET_RESOURCE_TYPE = 'host_image' as const;

export const ASSET_MAX_BYTES = 5 * 1024 * 1024;

/** 仅接受浏览器能直接解码的位图；SVG 需要消毒/栅格化，示例不接收。 */
export const ASSET_MIME_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

export interface AssetShape {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly byteSize: number;
  /** 相对 API Base 的稳定内容路径；文档里不保存它。 */
  readonly contentPath: string;
  /** 宿主引用扫描结果，供列表标记与删除按钮使用；删除保护仍由后端强制。 */
  readonly referenceCount: number;
  readonly createdAt: string;
}

export interface AssetReference {
  readonly id: string;
  readonly name: string;
}

/** multer 磁盘存储的临时文件；服务端校验后移入受管素材目录。 */
export interface UploadedAssetFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly path: string;
}
