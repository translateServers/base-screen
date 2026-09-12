import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { createVueMaterialDefinition } from '@base-screen/vue';
import ProductCard from '../components/ProductCard.vue';

export const HOST_PRODUCT_CARD_TYPE = 'vue-host.product-card';
export const HOST_PRODUCT_CARD_TAG = 'vue-host-product-card';

export interface HostProductCardProps {
  readonly title: string;
  readonly stock: number;
}

/**
 * 宿主自有的 Vue 物料：用 `@base-screen/vue` 的桥接把普通 Vue SFC 变成 Base Screen 物料。
 *
 * 桥接返回的是 catalog entry（`{ manifest, constructor }`）而不是 definition，元素注册
 * 由宿主的注册编排负责（见 main.ts 的 `elements`），与面板/控件的注册路径一致。
 */
export const HOST_PRODUCT_CARD_MANIFEST: BaseScreenMaterialManifest = {
  type: HOST_PRODUCT_CARD_TYPE,
  tagName: HOST_PRODUCT_CARD_TAG,
  name: '商品卡',
  category: '宿主业务',
  keywords: ['商品', '库存'],
  defaultSize: { width: 260, height: 120 },
  defaultProps: { title: '商品', stock: 0 },
  defaultStyle: {},
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object',
    properties: {
      title: { kind: 'string' },
      stock: { kind: 'number', minimum: 0 },
    },
    required: ['title', 'stock'],
  },
  propertyPanel: [
    { prop: 'title', label: '名称', control: 'text' },
    { prop: 'stock', label: '库存', control: 'number' },
  ],
  events: [],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

export function createHostProductCardElement() {
  return createVueMaterialDefinition<HostProductCardProps>({
    manifest: HOST_PRODUCT_CARD_MANIFEST,
    component: ProductCard,
    mapModel: (model) => ({
      title: typeof model.props.title === 'string' ? model.props.title : '',
      stock: typeof model.props.stock === 'number' ? model.props.stock : 0,
    }),
  });
}
