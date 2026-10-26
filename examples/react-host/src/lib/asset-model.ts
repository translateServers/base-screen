import type { HostAssetShape } from '../types';

/**
 * 宿主素材库的共享纯逻辑——三端逐字一致。
 *
 * 编辑页左栏与后台素材页共用身份、路径、上传校验、文案与引用错误解析；
 * 不包含 DOM、fetch 或框架状态。
 */
export const HOST_ASSET_RESOURCE_TYPE = 'host_image';
export const MAX_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ASSET_ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

export const ASSET_TEXT = {
  temporaryUpload: '临时上传',
  temporaryUploadHint: '仅当前大屏可见；长期使用请到后台素材库上传',
  temporaryVisibility: '仅本屏可见',
  publicUpload: '上传素材',
  publicUploadHint: '公共素材对所有大屏可用',
  searchPlaceholder: '搜索素材',
  adminTitle: '素材库',
  adminDescription: '统一管理公共图片素材；设计器只消费，临时上传仅当前大屏可见。',
  scopePublic: '公共素材',
  scopeTemporary: '临时素材',
  emptyPublic: '还没有公共素材。上传第一张图片，或检查后端素材播种是否开启。',
  emptyTemporary: '没有临时素材。临时素材只会从大屏设计器产生。',
  emptyFiltered: '没有匹配的素材。',
  loadFailed: '素材读取失败',
  retry: '重试',
  refresh: '刷新',
  remove: '删除',
  confirmRemove: '确认删除',
  cancel: '取消',
  removeConfirmTitle: '删除素材',
  removeBlockedTitle: '删除被拒绝',
  inUse: '引用',
  temporary: '临时',
  public: '公共',
  columnAsset: '素材',
  columnSource: '来源',
  columnType: '类型',
  columnSize: '大小',
  columnUploadedAt: '上传时间',
  columnExpiresAt: '过期时间',
  columnActions: '操作',
  screenPrefix: '大屏',
} as const;

export function assetContentPath(asset: Pick<HostAssetShape, 'id'>): string {
  return `/assets/${encodeURIComponent(asset.id)}/content`;
}

/** 返回拒绝原因；合法文件返回 null。客户端校验与后端白名单保持一致。 */
export function validateAssetFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ASSET_ACCEPTED_TYPES.split(',').includes(file.type)) return '不是支持的图片类型';
  if (file.size > MAX_ASSET_UPLOAD_BYTES) return '超过 5 MB';
  return null;
}

export function formatAssetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 后台列表展示用：临时素材带绑定大屏名。 */
export function assetScopeLabel(asset: Pick<HostAssetShape, 'temporary' | 'screenName'>): string {
  if (!asset.temporary) return ASSET_TEXT.public;
  return asset.screenName === null
    ? ASSET_TEXT.temporary
    : `${ASSET_TEXT.temporary} · ${asset.screenName}`;
}

/** 删除 409 的引用屏名称；错误体由宿主过滤器透传。 */
export function readAssetRefScreens(
  payload: Readonly<Record<string, unknown>> | undefined,
): string[] {
  const refScreens = payload?.refScreens;
  if (!Array.isArray(refScreens)) return [];
  return refScreens.flatMap((item) => {
    if (item === null || typeof item !== 'object') return [];
    const name = (item as { readonly name?: unknown }).name;
    return typeof name === 'string' ? [name] : [];
  });
}
