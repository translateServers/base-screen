import { mkdirSync } from 'node:fs';
import { screenshotDirectory } from './browser-harness/constants.mjs';
import { runBrowserHarness } from './browser-harness/run-browser-harness.mjs';

const serverPort = Number(process.env.BASE_SCREEN_BROWSER_PORT ?? 4174);
mkdirSync(screenshotDirectory, { recursive: true });

await runBrowserHarness(serverPort);
