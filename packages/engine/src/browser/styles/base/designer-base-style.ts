import adaptivityCss from './designer-base-adaptivity.css?inline';
import libraryCss from './designer-base-library.css?inline';
import materialGroupsCss from './designer-base-material-groups.css?inline';
import menusCss from './designer-base-menus.css?inline';
import shellCss from './designer-base-shell.css?inline';

export const DESIGNER_BASE_CSS = [
  menusCss,
  libraryCss,
  materialGroupsCss,
  shellCss,
  adaptivityCss,
].join('\n');
