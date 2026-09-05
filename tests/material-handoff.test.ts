import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateHandoffFiles } from '../skills/manage-base-screen-host-skills/scripts/validate-material-handoff.mjs';
import {
  validateAssociation,
  validateDraftMaterialCatalog,
  validateMaterialCandidate,
  validateMaterialProvenance,
  validateMaterialRequest,
} from '../skills/shared/material-handoff.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MATERIALS = join(TEST_DIR, 'fixtures', 'host-skill-smoke', 'materials.json');

async function tempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function material() {
  const values = JSON.parse(await readFile(MATERIALS, 'utf8')) as Array<Record<string, unknown>>;
  return values[0]!;
}

describe('material handoff contracts', () => {
  it('validates and associates request, candidate, and draft catalog', async () => {
    const request = {
      requestId: 'request-1',
      hostId: 'acme',
      screenDraftId: 'screen-draft-1',
      purpose: 'Need a KPI badge',
      framework: 'native',
      defaultSize: { width: 240, height: 80 },
      dataFields: [
        {
          datasetId: 'publication:daily-sales',
          fieldId: 'sales',
          valueType: 'number',
        },
      ],
      events: ['select'],
    };
    const candidate = {
      requestId: request.requestId,
      hostId: request.hostId,
      screenDraftId: request.screenDraftId,
      status: 'pending-review',
      framework: 'native',
      packageId: 'acme.draft.kpi',
      material: await material(),
      sourcePath: 'src/materials/kpi.ts',
      testPath: 'tests/materials/kpi.test.ts',
      registration: 'draft-only',
    };
    const catalog = {
      hostId: request.hostId,
      screenDraftId: request.screenDraftId,
      requestId: request.requestId,
      materials: [candidate.material],
    };
    expect(validateMaterialRequest(request).ok).toBe(true);
    expect(validateMaterialCandidate(candidate).ok).toBe(true);
    expect(validateDraftMaterialCatalog(catalog).ok).toBe(true);
    expect(validateAssociation(request, candidate, catalog)).toEqual([]);
  });

  it('rejects unknown fields, unsafe paths, credentials, duplicates, and mismatched associations', async () => {
    const request = {
      requestId: 'request-1',
      hostId: 'acme',
      screenDraftId: 'screen-draft-1',
      purpose: 'Need a badge',
      framework: 'native',
      defaultSize: { width: 100, height: 40 },
      dataFields: [],
      events: [],
      unexpected: true,
    };
    expect(validateMaterialRequest(request).ok).toBe(false);
    const candidate = {
      requestId: 'request-1',
      hostId: 'acme',
      screenDraftId: 'screen-draft-1',
      status: 'pending-review',
      framework: 'native',
      packageId: 'acme.draft.bad',
      material: { type: 'acme.bad', tagName: 'acme-bad', token: 'secret' },
      sourcePath: '../outside.ts',
      testPath: 'tests/materials/bad.test.ts',
      registration: 'draft-only',
    };
    expect(validateMaterialCandidate(candidate).ok).toBe(false);
    expect(
      validateAssociation(request, { ...candidate, requestId: 'request-2' }, undefined),
    ).not.toEqual([]);
  });

  it('validates files through the standalone validator with public manifest parsing', async () => {
    const root = await tempDir('material-handoff');
    try {
      const request = {
        requestId: 'request-2',
        hostId: 'acme',
        screenDraftId: 'screen-draft-2',
        purpose: 'badge',
        framework: 'native',
        defaultSize: { width: 100, height: 40 },
        dataFields: [],
        events: [],
      };
      const candidate = {
        requestId: request.requestId,
        hostId: request.hostId,
        screenDraftId: request.screenDraftId,
        status: 'pending-review',
        framework: 'native',
        packageId: 'acme.draft.badge',
        material: await material(),
        sourcePath: 'src/materials/badge.ts',
        testPath: 'tests/materials/badge.test.ts',
        registration: 'draft-only',
      };
      const catalog = {
        hostId: request.hostId,
        screenDraftId: request.screenDraftId,
        requestId: request.requestId,
        materials: [candidate.material],
      };
      const files = {
        request: join(root, 'request.json'),
        candidate: join(root, 'candidate.json'),
        catalog: join(root, 'catalog.json'),
      };
      await writeFile(files.request, JSON.stringify(request));
      await writeFile(files.candidate, JSON.stringify(candidate));
      await writeFile(files.catalog, JSON.stringify(catalog));
      expect(
        (
          await validateHandoffFiles({
            requestFile: files.request,
            candidateFile: files.candidate,
            catalogFile: files.catalog,
          })
        ).ok,
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
