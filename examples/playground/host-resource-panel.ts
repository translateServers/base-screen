import { h } from 'vue';
import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelSlotName,
} from '../../packages/sdk/src/index.ts';

// Playground 宿主专用模拟数据：不由 Base Screen 提供，也不是 Engine/SDK 公共资源目录。
export const HOST_RESOURCE_GROUP_ID = 'resources';
export const HOST_LEFT_PANEL_GROUPS = [
  { id: HOST_RESOURCE_GROUP_ID, label: '资源', icon: 'image' },
] as const satisfies readonly BaseScreenDesignerLeftPanelGroup[];

const HOST_RESOURCE_DEMO_ITEMS = [
  {
    id: 'campaign-cover',
    name: '活动主视觉',
    description: '深色数据活动封面',
    metadata: '1920 × 1080 · SVG',
    tone: 'cyan',
  },
  {
    id: 'dashboard-grid',
    name: '科技网格背景',
    description: '可平铺的画布背景',
    metadata: '1600 × 900 · SVG',
    tone: 'blue',
  },
  {
    id: 'product-placeholder',
    name: '产品图占位',
    description: '透明底商品素材',
    metadata: '800 × 800 · PNG',
    tone: 'violet',
  },
] as const;

export type HostResourceDemoItemId = (typeof HOST_RESOURCE_DEMO_ITEMS)[number]['id'];

export function renderHostResourcePanel(
  selectedResourceId: HostResourceDemoItemId | null,
  onSelect: (resourceId: HostResourceDemoItemId) => void,
) {
  const selectedResource = HOST_RESOURCE_DEMO_ITEMS.find(
    (resource) => resource.id === selectedResourceId,
  );
  const status =
    selectedResource === undefined ? '请选择一个宿主资源。' : `已选择：${selectedResource.name}`;
  return h(
    'section',
    {
      'aria-label': '宿主资源示例',
      class: 'host-resource-panel',
      'data-host-resource-panel': '',
      slot: baseScreenDesignerLeftPanelSlotName(HOST_RESOURCE_GROUP_ID),
    },
    [
      h('div', { class: 'host-resource-panel__intro' }, [
        h('strong', '宿主资源示例'),
        h('span', '模拟资源及其状态全部由 Vue Playground 宿主管理。'),
      ]),
      h(
        'ul',
        { class: 'host-resource-list', 'aria-label': '宿主模拟资源' },
        HOST_RESOURCE_DEMO_ITEMS.map((resource) =>
          h('li', { key: resource.id }, [
            h(
              'button',
              {
                'aria-pressed': String(resource.id === selectedResourceId),
                class: 'host-resource-card',
                'data-host-resource-id': resource.id,
                onClick: () => onSelect(resource.id),
                type: 'button',
              },
              [
                h('span', {
                  'aria-hidden': 'true',
                  class: 'host-resource-card__preview',
                  'data-resource-tone': resource.tone,
                }),
                h('span', { class: 'host-resource-card__copy' }, [
                  h('strong', resource.name),
                  h('span', resource.description),
                  h('small', resource.metadata),
                ]),
              ],
            ),
          ]),
        ),
      ),
      h(
        'output',
        {
          'aria-live': 'polite',
          class: 'host-resource-panel__status',
          'data-host-resource-status': '',
          title: status,
        },
        status,
      ),
    ],
  );
}
