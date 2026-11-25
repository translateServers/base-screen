import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCssBlocks } from './designer-style-scan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hosts = ['react-host', 'vue-host', 'vanilla-host'];
const failures = [];
const rawColorAllowlist = new Map();

for (const host of hosts) {
  rawColorAllowlist.set(
    `examples/${host}/src/styles/components.css`,
    new Set(['#0a2a47', '#061426', '#040b16']),
  );
  rawColorAllowlist.set(
    `examples/${host}/src/styles/asset-library.css`,
    new Set(['rgb(0 0 0 / 85%)']),
  );
}
rawColorAllowlist.set(
  'examples/vanilla-host/src/styles/component-library.css',
  new Set(['#111418', '#f3f5f8']),
);

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

let scannedFiles = 0;
let rawColorCount = 0;
let hostTokenReferenceCount = 0;
for (const host of hosts) {
  const hostRoot = resolve(root, 'examples', host);
  const index = readFileSync(resolve(hostRoot, 'index.html'), 'utf8');
  if (!/<body class="bs-host">/.test(index)) {
    failures.push(`HOST_STYLE_SCOPE_MISSING:examples/${host}/index.html`);
  }

  for (const file of cssFiles(resolve(hostRoot, 'src'))) {
    scannedFiles += 1;
    const rel = relative(root, file).replaceAll('\\', '/');
    const content = readFileSync(file, 'utf8');
    hostTokenReferenceCount += (content.match(/var\(--bs-host-/g) ?? []).length;
    const allowedColors = rawColorAllowlist.get(rel) ?? new Set();

    for (const block of scanCssBlocks(content, { file: rel })) {
      for (const { property, value } of block.declarations) {
        if (
          /^--(?:color|spacing|radius|font-family)/.test(property) &&
          !value.includes('var(--bs-host-')
        ) {
          failures.push(`HOST_STYLE_LOCAL_TOKEN_UNMAPPED:${rel}:${property}`);
        }
        const fontSize = property === 'font-size' ? Number.parseFloat(value) : Number.NaN;
        if (Number.isFinite(fontSize) && fontSize < 11) {
          failures.push(`HOST_STYLE_FONT_SIZE_FLOOR:${rel}:${property}:${value}`);
        }
        for (const match of value.matchAll(
          /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g,
        )) {
          const color = match[0].toLowerCase();
          rawColorCount += 1;
          if (!allowedColors.has(color)) {
            failures.push(`HOST_STYLE_RAW_COLOR:${rel}:${color}`);
          }
        }
      }
    }
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}
console.log(
  `host-styles ok: ${scannedFiles} files, ${hostTokenReferenceCount} public token references, ${rawColorCount} documented raw colors`,
);
