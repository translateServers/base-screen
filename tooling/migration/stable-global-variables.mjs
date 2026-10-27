import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * One-time, fail-closed migration from the retired name-addressed static/host
 * variable document shape to the stable-id shape.
 */
export function migrateStableGlobalVariables(input) {
  if (!isRecord(input) || !Array.isArray(input.variables)) {
    throw new Error('VARIABLE_MIGRATION_DOCUMENT_INVALID');
  }
  const names = new Map();
  const ids = new Set();
  const variables = input.variables.map((variable, index) => {
    if (!isRecord(variable) || (variable.type !== 'static' && variable.type !== 'host')) {
      throw new Error(`VARIABLE_MIGRATION_SOURCE_INVALID:${index}`);
    }
    if (typeof variable.name !== 'string' || names.has(variable.name)) {
      throw new Error(`VARIABLE_MIGRATION_NAME_AMBIGUOUS:${String(variable.name)}`);
    }
    const id = stableVariableId(variable.name, index, ids);
    ids.add(id);
    names.set(variable.name, id);
    const description =
      typeof variable.description === 'string' ? { description: variable.description } : {};
    if (variable.type === 'static') {
      if (!Object.hasOwn(variable, 'value')) {
        throw new Error(`VARIABLE_MIGRATION_STATIC_VALUE_MISSING:${variable.name}`);
      }
      return {
        type: 'static',
        id,
        name: variable.name,
        ...description,
        initialValue: structuredClone(variable.value),
      };
    }
    if (typeof variable.variableId !== 'string' || variable.variableId.length === 0) {
      throw new Error(`VARIABLE_MIGRATION_SOURCE_ID_INVALID:${variable.name}`);
    }
    return {
      type: 'data-source',
      id,
      name: variable.name,
      ...description,
      initialValue: null,
      sourceId: variable.variableId,
      controlled: true,
    };
  });
  const reference = (name, path) => {
    const id = names.get(name);
    if (id === undefined) throw new Error(`VARIABLE_MIGRATION_REFERENCE_UNKNOWN:${path}:${name}`);
    return id;
  };
  const components = Array.isArray(input.components)
    ? input.components.map((component, index) =>
        migrateComponent(component, reference, `components.${index}`),
      )
    : input.components;
  const blueprint = migrateBlueprint(input.blueprint, reference);
  return { ...structuredClone(input), components, variables, blueprint };
}

function migrateComponent(component, reference, path) {
  if (!isRecord(component) || !isRecord(component.dataSource)) return structuredClone(component);
  const dataSource = component.dataSource;
  if (dataSource.type === 'host-resource' && isRecord(dataSource.params)) {
    const params = Object.fromEntries(
      Object.entries(dataSource.params).map(([key, parameter]) => {
        if (!isRecord(parameter) || parameter.kind !== 'variable') {
          return [key, structuredClone(parameter)];
        }
        return [
          key,
          {
            kind: 'variable',
            variableId: reference(parameter.name, `${path}.dataSource.params.${key}`),
          },
        ];
      }),
    );
    return {
      ...structuredClone(component),
      dataSource: { ...structuredClone(dataSource), params },
    };
  }
  if (dataSource.type === 'variable' && typeof dataSource.name === 'string') {
    const migrated = { ...structuredClone(dataSource) };
    delete migrated.name;
    migrated.variableId = reference(dataSource.name, `${path}.dataSource`);
    return { ...structuredClone(component), dataSource: migrated };
  }
  return structuredClone(component);
}

function migrateBlueprint(blueprint, reference) {
  if (!isRecord(blueprint)) return structuredClone(blueprint);
  if (Array.isArray(blueprint.relations)) {
    throw new Error(
      'VARIABLE_MIGRATION_BLUEPRINT_SHAPE_UNSUPPORTED: blueprint.relations is already relationship-based; run the contracts document migration instead.',
    );
  }
  if (!Array.isArray(blueprint.rules)) return structuredClone(blueprint);
  return {
    ...structuredClone(blueprint),
    rules: blueprint.rules.map((rule, ruleIndex) => {
      if (!isRecord(rule)) return structuredClone(rule);
      const trigger = isRecord(rule.trigger) ? { ...structuredClone(rule.trigger) } : rule.trigger;
      if (isRecord(trigger) && trigger.type === 'variable-event' && 'variableName' in trigger) {
        trigger.variableId = reference(
          trigger.variableName,
          `blueprint.rules.${ruleIndex}.trigger`,
        );
        delete trigger.variableName;
      }
      return {
        ...structuredClone(rule),
        trigger,
        ...(isRecord(rule.condition)
          ? {
              condition: {
                ...structuredClone(rule.condition),
                left: migrateExpression(
                  rule.condition.left,
                  reference,
                  `blueprint.rules.${ruleIndex}.condition.left`,
                ),
                ...(Object.hasOwn(rule.condition, 'right')
                  ? {
                      right: migrateExpression(
                        rule.condition.right,
                        reference,
                        `blueprint.rules.${ruleIndex}.condition.right`,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        actions: Array.isArray(rule.actions)
          ? rule.actions.map((action, actionIndex) =>
              migrateAction(
                action,
                reference,
                `blueprint.rules.${ruleIndex}.actions.${actionIndex}`,
              ),
            )
          : rule.actions,
      };
    }),
  };
}

function migrateAction(action, reference, path) {
  if (!isRecord(action)) return structuredClone(action);
  const migrated = { ...structuredClone(action) };
  if (action.type === 'set-variable') {
    migrated.variableId = reference(action.variableName, path);
    delete migrated.variableName;
    migrated.value = migrateExpression(action.value, reference, `${path}.value`);
  } else if (action.type === 'emit-host-event' || action.type === 'host-action') {
    migrated.payload = migrateExpression(action.payload, reference, `${path}.payload`);
  }
  return migrated;
}

function migrateExpression(expression, reference, path) {
  if (!isRecord(expression)) return structuredClone(expression);
  if (expression.kind === 'variable') {
    return { kind: 'variable', variableId: reference(expression.name, path) };
  }
  if (expression.kind === 'array' && Array.isArray(expression.items)) {
    return {
      ...structuredClone(expression),
      items: expression.items.map((item, index) =>
        migrateExpression(item, reference, `${path}.items.${index}`),
      ),
    };
  }
  if (expression.kind === 'object' && isRecord(expression.properties)) {
    return {
      ...structuredClone(expression),
      properties: Object.fromEntries(
        Object.entries(expression.properties).map(([key, value]) => [
          key,
          migrateExpression(value, reference, `${path}.properties.${key}`),
        ]),
      ),
    };
  }
  return structuredClone(expression);
}

function stableVariableId(name, index, used) {
  const candidate = /^[A-Za-z0-9]/.test(name) ? name : `variable-${name}`;
  const bounded =
    candidate.length <= 128 ? candidate : `${candidate.slice(0, 118)}-${hashString(candidate)}`;
  if (!used.has(bounded)) return bounded;
  return `${bounded.slice(0, 118)}-${index + 1}-${hashString(name)}`;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function runCli() {
  const [, , inputPath, outputPath] = process.argv;
  if (inputPath === undefined) {
    throw new Error(
      'Usage: node tooling/migration/stable-global-variables.mjs <input.json> [output.json]',
    );
  }
  const migrated = migrateStableGlobalVariables(
    JSON.parse(readFileSync(resolve(inputPath), 'utf8')),
  );
  const serialized = `${JSON.stringify(migrated, null, 2)}\n`;
  if (outputPath === undefined) process.stdout.write(serialized);
  else writeFileSync(resolve(outputPath), serialized, 'utf8');
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  runCli();
}
