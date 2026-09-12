import { mkdirSync } from 'node:fs';
import { runBrowserHarness } from './browser-harness/run-browser-harness.mjs';
import { screenshotDirectory } from './browser-harness/shared/constants.mjs';

const serverPort = Number(process.env.BASE_SCREEN_BROWSER_PORT ?? 4174);
mkdirSync(screenshotDirectory, { recursive: true });

await runBrowserHarness(serverPort);
