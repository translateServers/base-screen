import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCREEN_FIXTURE = join(TEST_DIR, '../fixtures/legacy-host-skill-smoke');
const MATERIAL_FIXTURE = join(TEST_DIR, '../fixtures/legacy-host-material-skill-smoke');

export interface HostSnapshot {
  host: Record<string, unknown>;
  screenGuidelines: string;
  materialGuidelines: string;
  materialAuthoring: Record<string, unknown>;
  components: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  resourceTypes: Array<Record<string, unknown>>;
  datasets: Array<Record<string, unknown>>;
  datasetSamples?: Array<Record<string, unknown>>;
  materialProvenance?: Array<Record<string, unknown>>;
  materialTemplates?: Array<Record<string, unknown>>;
}

export async function makeSnapshot(): Promise<HostSnapshot> {
  const readJson = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(file, 'utf8')) as T;
  const [screenMaterials, materialMaterials] = await Promise.all([
    readJson<Array<Record<string, unknown>>>(join(SCREEN_FIXTURE, 'materials.json')),
    readJson<Array<Record<string, unknown>>>(join(MATERIAL_FIXTURE, 'materials.json')),
  ]);
  const materials = [...screenMaterials];
  for (const item of materialMaterials) {
    if (!materials.some((existing) => existing.type === item.type)) materials.push(item);
  }
  return {
    host: await readJson(join(SCREEN_FIXTURE, 'host.json')),
    screenGuidelines: await readFile(join(SCREEN_FIXTURE, 'design-guidelines.md'), 'utf8'),
    materialGuidelines: await readFile(join(MATERIAL_FIXTURE, 'material-guidelines.md'), 'utf8'),
    materialAuthoring: await readJson(join(MATERIAL_FIXTURE, 'material-authoring.json')),
    components: await readJson(join(MATERIAL_FIXTURE, 'components.json')),
    materials,
    resourceTypes: await readJson(join(SCREEN_FIXTURE, 'resource-types.json')),
    datasets: await readJson(join(SCREEN_FIXTURE, 'datasets.json')),
    datasetSamples: await readJson(join(SCREEN_FIXTURE, 'dataset-samples.json')),
  };
}

export async function writeSnapshotFile(overrides: Partial<HostSnapshot> = {}): Promise<{
  file: string;
  snapshot: HostSnapshot;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'base-screen-host-snapshot-'));
  const snapshot = { ...(await makeSnapshot()), ...overrides };
  const file = join(directory, 'host-snapshot.json');
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return { file, snapshot };
}
