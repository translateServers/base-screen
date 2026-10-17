import { describe, expect, it } from 'vitest';
import { migrateDatavGlobalVariables } from '../../tooling/migration/datav-global-variables.mjs';

describe('DataV global variable migration', () => {
  it('migrates variables and every name-addressed reference to stable ids', () => {
    const migrated = migrateDatavGlobalVariables({
      canvas: { width: 1, height: 1, backgroundColor: '#000000' },
      variables: [
        { type: 'static', name: 'region', value: 'north' },
        { type: 'host', name: '_tenant', variableId: 'tenant-source' },
      ],
      components: [
        {
          id: 'chart',
          dataSource: {
            type: 'host-resource',
            params: { region: { kind: 'variable', name: 'region' } },
          },
        },
      ],
      blueprint: {
        rules: [
          {
            id: 'set-region',
            trigger: { type: 'material-event', componentId: 'chart', eventName: 'click' },
            condition: {
              left: { kind: 'variable', name: '_tenant' },
              operator: 'exists',
            },
            actions: [
              {
                type: 'set-variable',
                variableName: 'region',
                value: { kind: 'variable', name: '_tenant' },
              },
            ],
          },
        ],
      },
    });

    expect(migrated).toMatchObject({
      variables: [
        { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
        {
          type: 'data-source',
          id: 'variable-_tenant',
          name: '_tenant',
          initialValue: null,
          sourceId: 'tenant-source',
          controlled: true,
        },
      ],
      components: [
        { dataSource: { params: { region: { kind: 'variable', variableId: 'region' } } } },
      ],
      blueprint: {
        rules: [
          {
            condition: { left: { kind: 'variable', variableId: 'variable-_tenant' } },
            actions: [
              {
                type: 'set-variable',
                variableId: 'region',
                value: { kind: 'variable', variableId: 'variable-_tenant' },
              },
            ],
          },
        ],
      },
    });
  });

  it('fails closed on unknown references', () => {
    expect(() =>
      migrateDatavGlobalVariables({
        variables: [{ type: 'static', name: 'known', value: null }],
        components: [
          {
            dataSource: {
              type: 'host-resource',
              params: { value: { kind: 'variable', name: 'missing' } },
            },
          },
        ],
        blueprint: { rules: [] },
      }),
    ).toThrow('VARIABLE_MIGRATION_REFERENCE_UNKNOWN');
  });
});
