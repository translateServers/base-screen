import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseScreenDocument, serializeScreenDocument } from '../packages/contracts/dist/index.js';

const COMPONENT_FIELDS = new Set([
  'id',
  'type',
  'name',
  'parentId',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'dataSource',
]);
const DOCUMENT_FIELDS = new Set(['nebulaVersion', 'canvas', 'components', 'variables']);
const VARIANT_VERSION = 1;

const options = parseArguments(process.argv.slice(2));
const paths = resolvePaths(options);
assertDistinctPaths(paths);

if (options.analyze) {
  runAnalyze(paths);
} else {
  runConvert(paths);
}

function runAnalyze(paths) {
  const analysis = analyzeInput(paths.input);
  writeReport(paths.report, analysis.report);
  if (analysis.report.status === 'failed') {
    fail('NEBULA_IMPORT_ANALYSIS_FAILED');
  }
}

function runConvert(paths) {
  removeStaleOutput(paths.output);

  let analysis;
  try {
    analysis = analyzeInput(paths.input);
  } catch (error) {
    writeReport(paths.report, failedReport('NEBULA_INPUT_INVALID'));
    throw error;
  }

  let decisions;
  try {
    decisions = readDecisions(paths.decision);
  } catch {
    writeReport(paths.report, {
      ...analysis.report,
      status: 'failed',
      findings: [
        ...analysis.report.findings,
        finding(
          'NEBULA_DECISION_INVALID',
          'blocking',
          [],
          'Decision file is not strict valid JSON.',
        ),
      ],
    });
    fail('NEBULA_DECISION_INVALID');
  }

  const resolution = resolveFindings(analysis, decisions);
  if (!resolution.ok) {
    writeReport(paths.report, {
      ...analysis.report,
      status: 'failed',
      findings: resolution.findings,
    });
    fail('NEBULA_IMPORT_UNRESOLVED');
  }

  const parsed = parseScreenDocument(resolution.document);
  if (!parsed.ok) {
    writeReport(paths.report, {
      ...analysis.report,
      status: 'failed',
      findings: [
        ...resolution.findings,
        ...parsed.diagnostics.map((diagnostic) =>
          finding(
            diagnostic.code,
            'blocking',
            diagnostic.path,
            'Mapped document failed canonical validation.',
          ),
        ),
      ],
    });
    fail('NEBULA_IMPORT_DOCUMENT_INVALID');
  }

  let serialized;
  try {
    serialized = serializeScreenDocument(parsed.value);
    const roundTripped = parseScreenDocument(JSON.parse(serialized));
    if (!roundTripped.ok || serializeScreenDocument(roundTripped.value) !== serialized) {
      fail('NEBULA_IMPORT_ROUND_TRIP_FAILED');
    }
  } catch {
    writeReport(paths.report, {
      ...analysis.report,
      status: 'failed',
      findings: [
        ...resolution.findings,
        finding('NEBULA_IMPORT_ROUND_TRIP_FAILED', 'blocking', [], 'Canonical round-trip failed.'),
      ],
    });
    fail('NEBULA_IMPORT_ROUND_TRIP_FAILED');
  }

  const report = {
    ...analysis.report,
    status: 'success',
    findings: resolution.findings,
    mappedComponents: resolution.mappedComponents,
    skippedComponents: resolution.skippedComponents,
  };
  try {
    writeAtomic(paths.output, `${serialized}\n`);
    writeReport(paths.report, report);
  } catch {
    removeStaleOutput(paths.output);
    fail('NEBULA_IMPORT_WRITE_FAILED');
  }
}

function analyzeInput(inputPath) {
  let source;
  try {
    source = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch {
    return {
      report: failedReport('NEBULA_INPUT_INVALID'),
      document: undefined,
      componentEntries: [],
    };
  }

  const detected = detectVariant(source);
  if (!detected.ok) {
    return {
      report: {
        status: 'failed',
        variant: null,
        mappedComponents: 0,
        skippedComponents: 0,
        findings: [finding(detected.code, 'blocking', [], detected.reason)],
      },
      document: undefined,
      componentEntries: [],
    };
  }

  const mapped = analyzeDocument(
    detected.document,
    detected.variant === 'document-root' ? ['nebulaVersion'] : [],
  );
  return {
    report: {
      status: mapped.findings.some((item) => item.severity === 'blocking')
        ? 'needs-decision'
        : 'ready',
      variant: detected.variant,
      mappedComponents: mapped.componentEntries.filter((item) => item.kind === 'mapped').length,
      skippedComponents: mapped.componentEntries.filter((item) => item.kind === 'skipped').length,
      findings: mapped.findings,
    },
    document: mapped.document,
    componentEntries: mapped.componentEntries,
  };
}

function detectVariant(source) {
  if (!isRecord(source) || source.nebulaVersion !== VARIANT_VERSION) {
    return {
      ok: false,
      code: 'NEBULA_VARIANT_UNRECOGNIZED',
      reason: 'No recognized Nebula signature matched.',
    };
  }

  const variants = [];
  if (isNebulaDocument(source)) {
    variants.push({ variant: 'document-root', document: source });
  }
  if (
    isRecord(source.project) &&
    source.project.projectVersion === VARIANT_VERSION &&
    isNebulaDocument(source.project.document)
  ) {
    variants.push({ variant: 'project-envelope', document: source.project.document });
  }
  if (
    isRecord(source.export) &&
    source.export.exportVersion === VARIANT_VERSION &&
    isNebulaDocument(source.export.document)
  ) {
    variants.push({ variant: 'export-wrapper', document: source.export.document });
  }

  if (variants.length !== 1) {
    return {
      ok: false,
      code: variants.length === 0 ? 'NEBULA_VARIANT_UNRECOGNIZED' : 'NEBULA_VARIANT_AMBIGUOUS',
      reason:
        variants.length === 0
          ? 'No recognized Nebula signature matched.'
          : 'More than one Nebula signature matched.',
    };
  }
  return { ok: true, ...variants[0] };
}

function isNebulaDocument(value) {
  return (
    isRecord(value) &&
    isRecord(value.canvas) &&
    Array.isArray(value.components) &&
    Array.isArray(value.variables)
  );
}

function analyzeDocument(source) {
  const findings = [];
  for (const key of Object.keys(source)) {
    if (!DOCUMENT_FIELDS.has(key)) {
      findings.push(
        finding(
          'NEBULA_FIELD_UNMAPPED',
          'blocking',
          [key],
          'Document field is not part of the canonical mapping.',
          undefined,
          `field-document-${key}`,
        ),
      );
    }
  }

  const componentEntries = source.components.map((component, index) =>
    analyzeComponent(component, index, findings),
  );
  return {
    findings,
    componentEntries,
    document: {
      canvas: source.canvas,
      components: componentEntries
        .filter((entry) => entry.kind === 'mapped')
        .map((entry) => entry.component),
      variables: source.variables,
      blueprint: { rules: [] },
    },
  };
}

function analyzeComponent(component, index, findings) {
  const sourcePath = ['components', index];
  if (!isRecord(component)) {
    findings.push(
      finding(
        'NEBULA_COMPONENT_SKIPPED',
        'blocking',
        sourcePath,
        'Component is not an object and cannot be mapped.',
        undefined,
        `component-${index}`,
      ),
    );
    return { kind: 'skipped', index };
  }

  for (const key of Object.keys(component)) {
    if (!COMPONENT_FIELDS.has(key)) {
      findings.push(
        finding(
          'NEBULA_FIELD_UNMAPPED',
          'blocking',
          [...sourcePath, key],
          'Component field is not part of the canonical mapping.',
          undefined,
          `field-component-${index}-${key}`,
        ),
      );
    }
  }

  if (typeof component.type !== 'string' || !isCanonicalMaterialType(component.type)) {
    findings.push(
      finding(
        'NEBULA_COMPONENT_TYPE_UNMAPPED',
        'blocking',
        [...sourcePath, 'type'],
        'Component type requires an explicit compatible material mapping.',
        [...sourcePath, 'type'],
        `component-${index}-type`,
      ),
    );
    return { kind: 'needs-map', index, component };
  }

  return { kind: 'mapped', index, component: canonicalComponent(component) };
}

function resolveFindings(analysis, decisions) {
  const findings = [...analysis.report.findings];
  if (analysis.document === undefined) {
    return { ok: false, findings };
  }

  const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
  const findingIds = new Set(
    findings.flatMap((item) => (item.decisionId === undefined ? [] : [item.decisionId])),
  );
  for (const decision of decisions) {
    if (!findingIds.has(decision.id)) {
      findings.push(
        finding(
          'NEBULA_DECISION_UNUSED',
          'blocking',
          [],
          'Decision does not match a finding.',
          undefined,
          decision.id,
        ),
      );
    }
  }

  const droppedComponents = new Set();
  for (const item of findings) {
    if (item.severity !== 'blocking') continue;
    if (item.decisionId === undefined) continue;
    const decision = decisionById.get(item.decisionId);
    if (decision === undefined) {
      findings.push(
        finding(
          'NEBULA_DECISION_MISSING',
          'blocking',
          item.sourcePath,
          'Blocking finding has no decision.',
          undefined,
          item.decisionId,
        ),
      );
      continue;
    }
    if (decision.action === 'cancel') {
      findings.push(
        finding(
          'NEBULA_DECISION_CANCELLED',
          'blocking',
          item.sourcePath,
          'Conversion was cancelled by decision.',
          undefined,
          item.decisionId,
        ),
      );
      continue;
    }
    if (item.code === 'NEBULA_COMPONENT_TYPE_UNMAPPED') {
      if (decision.action !== 'map' || !isCanonicalMaterialType(decision.targetMaterialType)) {
        findings.push(
          finding(
            'NEBULA_DECISION_INCOMPATIBLE',
            'blocking',
            item.sourcePath,
            'Component type requires a compatible map decision.',
            undefined,
            item.decisionId,
          ),
        );
      }
      continue;
    }
    if (decision.action !== 'drop') {
      findings.push(
        finding(
          'NEBULA_DECISION_INCOMPATIBLE',
          'blocking',
          item.sourcePath,
          'This loss can only be explicitly dropped.',
          undefined,
          item.decisionId,
        ),
      );
    }
    const componentIndex = componentIndexFromDecision(item.decisionId);
    if (componentIndex !== undefined && item.code === 'NEBULA_COMPONENT_SKIPPED') {
      droppedComponents.add(componentIndex);
    }
  }

  if (
    findings.some(
      (item) => item.code.startsWith('NEBULA_DECISION_') && item.severity === 'blocking',
    )
  ) {
    return { ok: false, findings };
  }

  const components = [];
  for (const entry of analysis.componentEntries) {
    if (entry.kind === 'mapped') {
      components.push(entry.component);
    } else if (entry.kind === 'needs-map') {
      const decision = decisionById.get(`component-${entry.index}-type`);
      components.push(
        canonicalComponent({ ...entry.component, type: decision.targetMaterialType }),
      );
    } else if (!droppedComponents.has(entry.index)) {
      return { ok: false, findings };
    }
  }

  return {
    ok: true,
    findings,
    document: { ...analysis.document, components },
    mappedComponents: components.length,
    skippedComponents: droppedComponents.size,
  };
}

function canonicalComponent(component) {
  return {
    id: component.id,
    type: component.type,
    name: component.name,
    parentId: component.parentId ?? null,
    position: component.position,
    size: component.size,
    rotation: component.rotation ?? 0,
    zIndex: component.zIndex ?? 0,
    status: component.status ?? { locked: false, hidden: false },
    props: component.props ?? {},
    style: component.style ?? {},
    dataSource: component.dataSource ?? null,
  };
}

function readDecisions(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.decisions)) {
    throw new Error('invalid decision file');
  }
  const ids = new Set();
  return value.decisions.map((decision) => {
    if (!isRecord(decision) || !isStrictDecision(decision) || ids.has(decision.id)) {
      throw new Error('invalid decision');
    }
    ids.add(decision.id);
    return decision;
  });
}

function isStrictDecision(value) {
  const keys = Object.keys(value).sort();
  if (typeof value.id !== 'string' || !['map', 'drop', 'cancel'].includes(value.action))
    return false;
  if (value.action === 'map') {
    return (
      keys.length === 3 &&
      keys[0] === 'action' &&
      keys[1] === 'id' &&
      keys[2] === 'targetMaterialType' &&
      typeof value.targetMaterialType === 'string'
    );
  }
  return keys.length === 2 && keys[0] === 'action' && keys[1] === 'id';
}

function parseArguments(args) {
  const options = { analyze: false };
  const allowed = new Set(['--analyze', '--input', '--output', '--report', '--decision']);
  const provided = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument) || provided.has(argument)) {
      fail('NEBULA_IMPORT_USAGE');
    }
    provided.add(argument);
    if (argument === '--analyze') {
      options.analyze = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) fail('NEBULA_IMPORT_USAGE');
    options[argument.slice(2)] = value;
    index += 1;
  }
  if (typeof options.input !== 'string' || typeof options.report !== 'string')
    fail('NEBULA_IMPORT_USAGE');
  if (options.analyze) {
    if (options.output !== undefined || options.decision !== undefined) fail('NEBULA_IMPORT_USAGE');
  } else if (typeof options.output !== 'string' || typeof options.decision !== 'string') {
    fail('NEBULA_IMPORT_USAGE');
  }
  return options;
}

function resolvePaths(options) {
  return {
    input: resolve(options.input),
    output: options.output === undefined ? undefined : resolve(options.output),
    report: resolve(options.report),
    decision: options.decision === undefined ? undefined : resolve(options.decision),
  };
}

function assertDistinctPaths(paths) {
  const values = Object.values(paths).filter((value) => value !== undefined);
  if (new Set(values).size !== values.length) fail('NEBULA_IMPORT_PATH_COLLISION');
}

function writeReport(path, report) {
  writeAtomic(path, `${JSON.stringify(report, null, 2)}\n`);
}

function writeAtomic(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function removeStaleOutput(path) {
  if (path !== undefined && existsSync(path)) rmSync(path, { force: true });
}

function failedReport(code) {
  return {
    status: 'failed',
    variant: null,
    mappedComponents: 0,
    skippedComponents: 0,
    findings: [finding(code, 'blocking', [], 'Input could not be analyzed.')],
  };
}

function finding(code, severity, sourcePath, reason, targetPath, decisionId) {
  return {
    code,
    severity,
    sourcePath,
    ...(targetPath === undefined ? {} : { targetPath }),
    reason,
    ...(decisionId === undefined ? {} : { decisionId }),
  };
}

function componentIndexFromDecision(id) {
  const match = /^component-(\d+)$/.exec(id);
  return match === null ? undefined : Number(match[1]);
}

function isCanonicalMaterialType(value) {
  return typeof value === 'string' && /^base\.[a-z][a-z0-9-]*$/.test(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code) {
  throw new Error(code);
}
