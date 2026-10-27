// From the workspace root:
// pnpm exec node packages/engine/tests/browser/viewport/designer-snap-performance.mjs
// Synthetic calculation-only benchmark; no DOM, timers, or CI timing assertions.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const warmupFrames = 60;
const sampleFrames = 300;
const server = await createServer({
  appType: 'custom',
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  root: fileURLToPath(new URL('../../../../../', import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { DesignerWorkbenchController } = await server.ssrLoadModule(
    '/packages/engine/src/browser/controllers/workbench/designer-workbench-controller.ts',
  );
  console.log(JSON.stringify({ node: process.version, warmupFrames, sampleFrames }));
  for (const count of [100, 1_000, 5_000]) {
    const document = createDocument(count);
    const controller = new DesignerWorkbenchController({
      getCanvas: () => undefined,
      getDocument: () => document,
      getInteraction: () => ({ focusedComponentId: null, selectedComponentIds: [] }),
      getRoot: () => null,
      getZoom: () => 1,
    });
    const bounds = { left: 50, right: 150, top: 50, bottom: 90 };
    controller.setSnapSessionActive(true);
    const point = measure((frame) =>
      controller.snapPoint({ x: 250 + frame * 0.37, y: 160 + frame * 0.21 }),
    );
    const selectionWithMeasurements = measure((frame) =>
      controller.snapSelectionOffset(bounds, { x: 200 + frame * 0.37, y: 110 + frame * 0.21 }),
    );
    controller.setSnapSessionActive(false);
    console.log(JSON.stringify({ components: count, point, selectionWithMeasurements }));
  }
} finally {
  await server.close();
}

function measure(run) {
  for (let frame = 0; frame < warmupFrames; frame++) run(frame);
  const samples = [];
  for (let frame = 0; frame < sampleFrames; frame++) {
    const start = performance.now();
    run(frame);
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return {
    medianMs: Number(samples[Math.floor(sampleFrames / 2)].toFixed(3)),
    p95Ms: Number(samples[Math.floor(sampleFrames * 0.95)].toFixed(3)),
  };
}

function createDocument(count) {
  return {
    canvas: { width: 12_000, height: 12_000, backgroundColor: '#000000' },
    components: Array.from({ length: count }, (_, index) => ({
      id: `c${index}`,
      type: 'base.rectangle',
      name: `c${index}`,
      parentId: null,
      position: { x: (index * 137) % 11_500, y: (index * 83) % 11_500 },
      size: { width: 101 + (index % 7), height: 37 + (index % 11) },
      rotation: index % 3 === 0 ? 15 : 0,
      zIndex: index,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    })),
    variables: [],
    blueprint: { relations: [] },
  };
}
