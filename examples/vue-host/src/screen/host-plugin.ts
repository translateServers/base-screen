import type {
  BaseScreenPluginRuntime,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import { definePlugin } from '@base-screen/plugin-sdk';
import { HOST_PRODUCT_CARD_TAG, HOST_PRODUCT_CARD_TYPE } from './product-card';

export const HOST_PLUGIN_ID = 'vue-host.demo';
export const HOST_BUMP_COMMAND_ID = 'vue-host.bump-stock';
export const HOST_BUMP_STEP = 10;

/**
 * 宿主自有的插件。这是"宿主也要写插件"的最小真实形态：声明自己的物料贡献，
 * 并用一条命令把设计上下文读出来再写回去。
 *
 * - `design.read`：先读当前文档与选区，拿到现有库存；
 * - `command.execute`：再经文档命令写回，因此改动进 history、可撤销。
 *
 * manifest 用 `definePlugin` 在构造点自校验，写错立即抛错而不是等宿主 preflight。
 */
export function createHostPlugin(): BaseScreenPluginRuntime {
  let commandPort: PluginCommandPort | undefined;
  let designReadPort: PluginDesignReadPort | undefined;

  const defined = definePlugin({
    manifest: {
      id: HOST_PLUGIN_ID,
      dependencies: [],
      capabilities: ['command.execute', 'design.read'],
      contributions: [
        {
          kind: 'material',
          type: HOST_PRODUCT_CARD_TYPE,
          tagName: HOST_PRODUCT_CARD_TAG,
        },
        {
          kind: 'command',
          id: HOST_BUMP_COMMAND_ID,
          name: '补货 +10',
          requiredCapability: 'command.execute',
          menus: ['commandPalette', 'context.component'],
        },
      ],
    },
    commands: {
      [HOST_BUMP_COMMAND_ID]: async () => {
        if (commandPort === undefined || designReadPort === undefined) {
          return {
            ok: false as const,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'PLUGIN_CORE_SESSION_INVALID' as const,
                path: [] as const,
                message: 'Plugin ports are unavailable before activation.',
              },
            ],
          };
        }
        const snapshot = await designReadPort.read();
        if (!snapshot.ok) return snapshot;

        const products = snapshot.value.document.components.filter(
          (component) => component.type === HOST_PRODUCT_CARD_TYPE,
        );
        if (products.length === 0) {
          return {
            ok: false as const,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID' as const,
                path: [] as const,
                message: 'The document has no product card to restock.',
              },
            ],
          };
        }
        // 优先补当前聚焦的商品，否则退回第一个：没有选区时命令仍然可用。
        const focusedId = snapshot.value.focusedComponentId;
        const target = products.find((component) => component.id === focusedId) ?? products[0]!;
        const currentProps = target.props as { readonly [key: string]: unknown };
        const currentStock = currentProps.stock;

        // `update-components` 的 patch 是按顶层键整体替换：`props` 写进去就是完整新值。
        // 因此不能只发 `{ stock }`——那样会丢掉 schema 里同样必填的 `title`，
        // 提交时会被物料 propsSchema 拒绝。正确做法是基于读到的现状拼出完整 props。
        return commandPort.execute({
          commandId: 'update-components',
          args: {
            componentIds: [target.id],
            patch: {
              props: {
                ...currentProps,
                stock: (typeof currentStock === 'number' ? currentStock : 0) + HOST_BUMP_STEP,
              },
            },
          },
        });
      },
    },
    activate(context) {
      commandPort = context.commandPort;
      designReadPort = context.designReadPort;
    },
    deactivate() {
      commandPort = undefined;
      designReadPort = undefined;
    },
    dispose() {
      commandPort = undefined;
      designReadPort = undefined;
    },
  });

  if (!defined.ok) {
    throw new Error(
      `VUE_HOST_PLUGIN_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}
