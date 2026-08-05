import type {
  ScreenBlueprint,
  ScreenBlueprintRule,
  ScreenDiagnostic,
} from '@base-screen/contracts';

export interface DesignerBlueprintGraphNode {
  readonly id: string;
  readonly ruleId: string;
  readonly kind: 'trigger' | 'condition' | 'action';
  readonly label: string;
}

export interface DesignerBlueprintGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface DesignerBlueprintGraphProjection {
  readonly nodes: readonly DesignerBlueprintGraphNode[];
  readonly edges: readonly DesignerBlueprintGraphEdge[];
  readonly selectedNodeId: string | undefined;
  readonly searchQuery: string;
  readonly diagnostics: readonly ScreenDiagnostic[];
  readonly simulationLog: readonly string[];
  readonly zoom: number;
}

export class DesignerBlueprintGraphSession {
  #selectedNodeId: string | undefined;
  #searchQuery = '';
  #diagnostics: readonly ScreenDiagnostic[] = [];
  #simulationLog: readonly string[] = [];
  #zoom = 1;

  project(blueprint: ScreenBlueprint | undefined): DesignerBlueprintGraphProjection {
    const allNodes = blueprint === undefined ? [] : blueprint.rules.flatMap(projectRule);
    const nodes = allNodes.filter((node) => this.matchesSearch(node));
    const nodeIds = new Set(allNodes.map((node) => node.id));
    if (this.#selectedNodeId !== undefined && !nodeIds.has(this.#selectedNodeId)) {
      this.#selectedNodeId = undefined;
    }
    return {
      nodes,
      edges: projectEdges(nodes),
      selectedNodeId: this.#selectedNodeId,
      searchQuery: this.#searchQuery,
      diagnostics: this.#diagnostics,
      simulationLog: this.#simulationLog,
      zoom: this.#zoom,
    };
  }

  selectNode(nodeId: string | undefined): void {
    this.#selectedNodeId = nodeId;
  }

  selectAdjacent(blueprint: ScreenBlueprint | undefined, direction: -1 | 1): void {
    const nodes = this.project(blueprint).nodes;
    if (nodes.length === 0) return;
    const current = nodes.findIndex((node) => node.id === this.#selectedNodeId);
    const index = current === -1 ? (direction === 1 ? 0 : nodes.length - 1) : current + direction;
    this.#selectedNodeId = nodes[Math.min(nodes.length - 1, Math.max(0, index))]?.id;
  }

  setSearchQuery(query: string): void {
    this.#searchQuery = query.trim();
  }

  setDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.#diagnostics = diagnostics.map((diagnostic) => ({
      ...diagnostic,
      path: [...diagnostic.path],
    }));
  }

  appendSimulationLog(entry: string): void {
    this.#simulationLog = [...this.#simulationLog.slice(-19), entry];
  }

  setZoom(zoom: number): void {
    this.#zoom = Math.min(2, Math.max(0.25, zoom));
  }

  zoomIn(): void {
    this.setZoom(this.#zoom + 0.25);
  }

  zoomOut(): void {
    this.setZoom(this.#zoom - 0.25);
  }

  fit(): void {
    this.#zoom = 1;
  }

  clear(): void {
    this.#selectedNodeId = undefined;
    this.#searchQuery = '';
    this.#diagnostics = [];
    this.#simulationLog = [];
    this.#zoom = 1;
  }

  private matchesSearch(node: DesignerBlueprintGraphNode): boolean {
    const query = this.#searchQuery.toLocaleLowerCase();
    return query.length === 0 || node.label.toLocaleLowerCase().includes(query);
  }
}

function projectRule(rule: ScreenBlueprintRule): readonly DesignerBlueprintGraphNode[] {
  const nodes: DesignerBlueprintGraphNode[] = [
    {
      id: `${rule.id}:trigger`,
      ruleId: rule.id,
      kind: 'trigger',
      label: `${rule.trigger.componentId}.${rule.trigger.eventName}`,
    },
  ];
  if (rule.condition !== undefined) {
    nodes.push({ id: `${rule.id}:condition`, ruleId: rule.id, kind: 'condition', label: '条件' });
  }
  for (const [index, action] of rule.actions.entries()) {
    nodes.push({
      id: `${rule.id}:action:${index}`,
      ruleId: rule.id,
      kind: 'action',
      label:
        action.type === 'set-variable'
          ? `设置 ${action.variableName}`
          : action.type === 'emit-host-event'
            ? `发送 ${action.eventName}`
            : `调用 ${action.actionId}`,
    });
  }
  return nodes;
}

function projectEdges(
  nodes: readonly DesignerBlueprintGraphNode[],
): readonly DesignerBlueprintGraphEdge[] {
  const edges: DesignerBlueprintGraphEdge[] = [];
  for (let index = 1; index < nodes.length; index++) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (previous !== undefined && current !== undefined && previous.ruleId === current.ruleId) {
      edges.push({ from: previous.id, to: current.id });
    }
  }
  return edges;
}
