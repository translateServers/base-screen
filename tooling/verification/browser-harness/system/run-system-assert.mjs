import { withViteBrowser } from '../../browser-verification.mjs';
import { assertSystemGallery } from './assert-system-gallery.mjs';

const port = Number(process.env.BASE_SCREEN_SYSTEM_ASSERT_PORT ?? 5399);

await withViteBrowser(
  {
    root: 'tooling/verification/browser-harness',
    optimizeDeps: { force: false },
    server: { port },
  },
  async ({ baseUrl, browser }) => {
    const result = await assertSystemGallery(browser, baseUrl);
    console.log(`SYSTEM_GALLERY_OK ${JSON.stringify(result)}`);
  },
);
