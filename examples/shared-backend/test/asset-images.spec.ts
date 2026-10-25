import { createAssetPng } from '../src/assets/asset-images';

const SPEC = {
  width: 32,
  height: 24,
  top: [10, 20, 30] as const,
  bottom: [200, 210, 220] as const,
  accent: [240, 200, 140] as const,
};

describe('createAssetPng', () => {
  it('emits a valid RGBA PNG with the requested dimensions', () => {
    const png = createAssetPng(SPEC);

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // signature(8) + length(4) + type(4) 后是 IHDR 数据。
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(24);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('is deterministic for the same palette', () => {
    expect(createAssetPng(SPEC)).toEqual(createAssetPng(SPEC));
    expect(createAssetPng({ ...SPEC, accent: [0, 0, 0] })).not.toEqual(createAssetPng(SPEC));
  });
});
