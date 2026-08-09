import { describe, expect, it } from 'vitest';
import { SCREEN_DOCUMENT_JSON_SCHEMA } from '../../src/document/json-schema.js';
import { parseScreenDocument } from '../../src/document/parse.js';
import goldenSchema from '../../src/screen-document.schema.json';
import {
  fullBindingDocument,
  legacyArbitraryParamsDocument,
  missingBindingDocument,
  nullBindingDocument,
} from '../document/__fixtures__/host-resource-documents.js';

type SchemaNode = Record<string, unknown>;

function propertiesOf(node: SchemaNode): Record<string, unknown> {
  return node.properties as Record<string, unknown>;
}

function hostResourceBranch(schema: SchemaNode): SchemaNode {
  const components = propertiesOf(schema).components as SchemaNode;
  const items = components.items as SchemaNode;
  const dataSource = propertiesOf(items).dataSource as { anyOf: unknown[] };
  const branch = dataSource.anyOf.find((entry) => {
    const candidate = entry as SchemaNode;
    const type = (candidate.properties as SchemaNode | undefined)?.type as SchemaNode | undefined;
    return type?.const === 'host-resource';
  });
  if (branch === undefined) throw new Error('host-resource schema branch not found');
  return branch as SchemaNode;
}

describe('screen-document schema golden', () => {
  it('is identical to the committed golden artifact', () => {
    expect(goldenSchema).toEqual(SCREEN_DOCUMENT_JSON_SCHEMA);
  });

  it('requires binding on the host-resource data source branch', () => {
    const branch = hostResourceBranch(goldenSchema as unknown as SchemaNode);
    expect(branch.required).toEqual(['type', 'resourceType', 'resourceId', 'params', 'binding']);
    const binding = propertiesOf(branch).binding as { anyOf: unknown[] };
    const nullEntry = binding.anyOf.find((entry) => (entry as SchemaNode).type === 'null');
    const objectEntry = binding.anyOf.find((entry) => (entry as SchemaNode).type === 'object');
    expect(nullEntry).toBeDefined();
    const bindingObject = objectEntry as SchemaNode;
    expect(bindingObject.required).toEqual(['fields']);
    expect(propertiesOf(bindingObject).fields).toBeDefined();
  });

  it('does not resurrect the legacy arbitrary-JSON parameter shape', () => {
    const branch = hostResourceBranch(goldenSchema as unknown as SchemaNode);
    const params = propertiesOf(branch).params as SchemaNode;
    const additional = params.additionalProperties as SchemaNode | undefined;
    expect(additional).toBeDefined();
    expect((additional as { anyOf?: unknown[] }).anyOf?.length).toBeGreaterThanOrEqual(2);
  });

  it('agrees with the strict parser on the canonical host-resource fixtures', () => {
    for (const fixture of [nullBindingDocument, fullBindingDocument]) {
      const result = parseScreenDocument(fixture);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`valid fixture rejected: ${result.diagnostics[0]?.code}`);
    }
    for (const fixture of [missingBindingDocument, legacyArbitraryParamsDocument]) {
      expect(parseScreenDocument(fixture).ok).toBe(false);
    }
  });
});
