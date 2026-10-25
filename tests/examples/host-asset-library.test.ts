import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ASSET_MIME_EXTENSIONS,
  HOST_ASSET_RESOURCE_TYPE as BACKEND_RESOURCE_TYPE,
} from '../../examples/shared-backend/src/assets/asset.types';
import {
  assetContentPath,
  buildAssetInsertIntent,
  HOST_ASSET_RESOURCE_TYPE,
  resolveAssetReplaceTarget,
} from '../../examples/vanilla-host/src/screen/asset-library';
import { HOST_IMAGE_RESOURCE } from '../../examples/vanilla-host/src/screen/host-resource-plugin';
import { BASE_SCREEN_IMAGE_MATERIAL_MANIFEST } from '../../packages/material/src/image.js';

const HOSTS = ['vanilla-host', 'react-host', 'vue-host'] as const;
const SHARED_FILES = [
  'src/screen/asset-library.ts',
  'src/screen/host-resource-plugin.ts',
  'src/screen/host-data-channel.ts',
  'src/types.ts',
  'src/lib/api.ts',
  'src/styles/asset-library.css',
] as const;

describe('host asset library contract (ADR-0089)', () => {
  it('uses one host_image identity across backend, plugin contribution, and UI', () => {
    expect(HOST_ASSET_RESOURCE_TYPE).toBe('host_image');
    expect(BACKEND_RESOURCE_TYPE).toBe(HOST_ASSET_RESOURCE_TYPE);
    expect(HOST_IMAGE_RESOURCE).toBe(HOST_ASSET_RESOURCE_TYPE);
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.type).toBe('base.image');
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.dataCapabilities).toContain('host-resource');
  });

  it('builds an insert intent with identity only (no URL or credentials)', () => {
    const intent = buildAssetInsertIntent({ id: 'asset-42', name: '封面' });
    expect(intent).toEqual({
      materialType: 'base.image',
      name: '封面',
      dataSource: {
        type: 'host-resource',
        resourceType: 'host_image',
        resourceId: 'asset-42',
        params: {},
        binding: null,
      },
    });
    const serialized = JSON.stringify(intent);
    expect(serialized).not.toContain('http');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('headers');
  });

  it('exposes a stable, encoded content path that is not part of the document', () => {
    expect(assetContentPath({ id: 'a/b:c' })).toBe('/assets/a%2Fb%3Ac/content');
  });

  it('only replaces a single base.image component without a dataValue key', () => {
    const components = [
      { id: 'image-1', type: 'base.image' },
      { id: 'image-new', type: 'base.image', dataValue: null },
      { id: 'text-1', type: 'base.text' },
    ];
    expect(resolveAssetReplaceTarget(components, ['image-1'])).toBe('image-1');
    expect(resolveAssetReplaceTarget(components, ['image-1', 'text-1'])).toBeUndefined();
    expect(resolveAssetReplaceTarget(components, ['image-new'])).toBeUndefined();
    expect(resolveAssetReplaceTarget(components, ['text-1'])).toBeUndefined();
    expect(resolveAssetReplaceTarget(components, ['missing'])).toBeUndefined();
    expect(resolveAssetReplaceTarget(components, [])).toBeUndefined();
  });

  it('accepts bitmap MIME types only and rejects SVG', () => {
    expect([...ASSET_MIME_EXTENSIONS.keys()].sort()).toEqual([
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(ASSET_MIME_EXTENSIONS.has('image/svg+xml')).toBe(false);
  });

  it('keeps the asset library, API types, and resource types byte-identical across hosts', () => {
    for (const file of SHARED_FILES) {
      const baseline = readFileSync(`examples/vanilla-host/${file}`, 'utf8');
      for (const host of HOSTS.slice(1)) {
        expect(
          readFileSync(`examples/${host}/${file}`, 'utf8'),
          `${host}/${file} 必须与 vanilla 逐字一致`,
        ).toBe(baseline);
      }
    }
  });
});
