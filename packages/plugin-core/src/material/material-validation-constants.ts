export const MAX_MATERIAL_MANIFEST_BYTES = 256 * 1024;
export const MAX_SCHEMA_DEPTH = 16;
export const MAX_KEYWORDS = 64;
export const MAX_EVENTS = 64;
export const MAX_PROPERTY_PANEL_FIELDS = 512;
export const MAX_COVER_LENGTH = 2048;
export const RESERVED_TAG_NAMES = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

export const MANIFEST_FIELDS = new Set([
  'type',
  'tagName',
  'name',
  'category',
  'keywords',
  'defaultSize',
  'defaultProps',
  'defaultStyle',
  'defaultData',
  'staticData',
  'propsSchema',
  'propertyPanel',
  'styleSchema',
  'stylePanel',
  'events',
  'dataCapabilities',
  'dataBinding',
  'designCapabilities',
  'libraryVisible',
  'cover',
  'editorDescriptor',
]);
