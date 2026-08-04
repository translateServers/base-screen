import { writeFileSync } from 'node:fs';
import { SCREEN_DOCUMENT_JSON_SCHEMA } from '../packages/contracts/dist/index.js';

writeFileSync(
  new URL('../packages/contracts/src/screen-document.schema.json', import.meta.url),
  `${JSON.stringify(SCREEN_DOCUMENT_JSON_SCHEMA, null, 2)}\n`,
);
