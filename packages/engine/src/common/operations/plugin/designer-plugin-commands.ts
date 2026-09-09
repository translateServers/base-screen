import type {
  BaseScreenPluginCatalog,
  BaseScreenPluginContribution,
} from '@base-screen/plugin-core';

export interface DesignerPluginCommandPaletteItem {
  readonly id: string;
  readonly name: string;
  readonly disabled: boolean;
}

export function listDesignerPluginCommandPaletteItems(
  catalog: BaseScreenPluginCatalog | undefined,
  hasCommandPort: boolean,
): readonly DesignerPluginCommandPaletteItem[] {
  if (catalog === undefined) return [];
  const items: DesignerPluginCommandPaletteItem[] = [];
  for (const plugin of catalog.list()) {
    for (const contribution of plugin.contributions) {
      if (contribution.kind !== 'command') continue;
      items.push({
        id: contribution.id,
        name: contribution.name,
        disabled: !hasCommandPort || !isGrantedCommand(plugin.grantedCapabilities, contribution),
      });
    }
  }
  return items.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function isGrantedCommand(
  grantedCapabilities: readonly string[],
  contribution: BaseScreenPluginContribution & { readonly kind: 'command' },
): boolean {
  return grantedCapabilities.includes(contribution.requiredCapability);
}
