import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { DESIGNER_OPERATION_TEXT } from '../../../common/operations/designer-operation-registry.js';
import type { BaseScreenMaterialLibraryGrouping } from '../../../common/operations/material-library/material-library-grouping.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import type { BaseScreenMaterialLibraryState } from '../../../common/operations/material-library/material-library-state.js';
import type { BaseScreenDesignerLeftPanelGroup } from '../../../common/operations/workbench/designer-left-panel-groups.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolMaterialTypes,
} from '../../../common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon, designerToolGlyph } from '../../ui/designer-icons.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { renderDesignerLeftPanelGroups } from '../designer-left-panel-groups-dom.js';
import {
  populateMaterialLibrary,
  visibleLibraryMaterials,
} from '../material-library/designer-material-library-dom.js';

// 工具图标供 controllers 层消费（controllers 可依赖 dom，但不得直接依赖 ui 叶子层）。
export { designerToolGlyph };

import { designerWorkspaceMarkup } from './designer-workspace-markup.js';
import { SHORTCUT_HELP_SECTIONS } from './designer-workspace-template.js';

export function createDesignerWorkspace(
  ownerDocument: Document,
  materials: readonly (BaseScreenMaterialCatalogEntry | BaseScreenResolvedMaterialLibraryItem)[],
  toolMaterialTypes: DesignerToolMaterialTypes | undefined,
  materialLibraryState?: BaseScreenMaterialLibraryState,
  materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping,
  leftPanelGroups?: readonly BaseScreenDesignerLeftPanelGroup[],
): HTMLElement {
  const visibleMaterials = visibleLibraryMaterials(materials);
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.innerHTML = designerWorkspaceMarkup(visibleMaterials.length);

  // Nebula 布局：单条顶栏（品牌+保存状态｜工具簇+撤销重做｜动作组+缩放+菜单），顶栏与状态栏全宽，画布与左右面板并排。
  // 顶栏与状态栏从 workspace 内移动到 grid 顶层，使其各自占据整行。
  const topbar = layout.querySelector<HTMLElement>('.designer-topbar')!;
  const statusbar = layout.querySelector<HTMLElement>('.statusbar')!;
  layout.prepend(topbar);
  layout.appendChild(statusbar);

  // 下拉菜单（含帮助面板）从顶栏移出到布局根，避免被顶栏的 overflow-x: auto
  // 裁剪上下文遮断；绝对定位相对 .designer 顶部定位，不受栅格排版影响。
  for (const menu of layout.querySelectorAll<HTMLElement>('[data-menu]')) {
    layout.appendChild(menu);
  }

  const projectWorkspace = ownerDocument.createElement('section');
  projectWorkspace.className = 'project-workspace';
  projectWorkspace.dataset.projectWorkspace = 'true';
  projectWorkspace.hidden = true;
  layout.appendChild(projectWorkspace);

  const importConfirmation = ownerDocument.createElement('section');
  importConfirmation.className = 'import-confirmation';
  importConfirmation.dataset.importConfirmation = 'true';
  importConfirmation.hidden = true;
  importConfirmation.setAttribute('role', 'alertdialog');
  importConfirmation.ariaLabel = DESIGNER_UI_TEXT.importConfirm;
  importConfirmation.innerHTML = `
    <div class="designer-dialog-surface import-confirmation-card">
      <header>
        <span class="import-icon" aria-hidden="true">?</span>
        <span data-import-title>${DESIGNER_UI_TEXT.importReplace}</span>
      </header>
      <div data-import-body></div>
    </div>`;
  layout.appendChild(importConfirmation);

  const helpDialog = ownerDocument.createElement('section');
  helpDialog.className = 'designer-help-dialog';
  helpDialog.dataset.helpDialog = 'true';
  helpDialog.hidden = true;
  helpDialog.setAttribute('role', 'dialog');
  helpDialog.setAttribute('aria-modal', 'true');
  helpDialog.ariaLabel = DESIGNER_UI_TEXT.shortcutHelp;
  helpDialog.innerHTML = `
    <div class="designer-dialog-surface help-card">
      <header>
        <div class="help-heading">
          <span>${DESIGNER_UI_TEXT.shortcuts}</span>
          <p>${DESIGNER_UI_TEXT.shortcutHelpIntro}</p>
        </div>
        <button type="button" class="designer-control designer-button designer-icon-button help-close" data-variant="ghost" data-help-close aria-label="${DESIGNER_UI_TEXT.helpClose}">
          ${designerIcon('close')}
        </button>
      </header>
      <div class="help-content">
        ${SHORTCUT_HELP_SECTIONS.map(
          ({ title, operationIds }) => `<section class="help-section">
            <h3>${title}</h3>
            <div class="help-shortcuts">
              ${operationIds
                .flatMap((id) => {
                  const operation = DESIGNER_OPERATION_TEXT[id];
                  return 'shortcut' in operation
                    ? [
                        `<p data-help-operation="${id}"><span>${operation.label}</span><kbd>${operation.shortcut}</kbd></p>`,
                      ]
                    : [];
                })
                .join('')}
            </div>
          </section>`,
        ).join('')}
      </div>
    </div>`;
  layout.appendChild(helpDialog);

  renderDesignerLeftPanelGroups(layout, leftPanelGroups);
  populateMaterialLibrary(layout, materials, materialLibraryState, materialLibraryGrouping);
  for (const tool of DESIGNER_TOOLS) {
    const control = layout.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`)!;
    control.disabled = tool.materialKey !== undefined && toolMaterialTypes?.[tool.id] === undefined;
  }
  // 静态模板里的裸输入同样收口到共享原语；控制器在此之后才连接，引用仍按 data-* 查找。
  adoptDesignerFormControls(layout);
  return layout;
}

// 物料库 DOM（网格卡片、分类派生、状态投影）沉淀在独立模块；为兼容既有消费方在此转发导出。
export {
  materialCategoryHue,
  materialCategoryIcon,
  materialLibraryActions,
  materialLibraryCategories,
  orderedMaterialLibraryMaterials,
  populateMaterialLibrary,
  renderMaterialLibraryState,
  visibleLibraryMaterials,
} from '../material-library/designer-material-library-dom.js';
export type {
  DesignerContextMenuAction,
  DesignerMenuEntry,
} from './designer-workspace-template.js';
export {
  contextMenuHtml,
  contextMenuSummaryHtml,
  downloadDesignerDocument,
} from './designer-workspace-template.js';
