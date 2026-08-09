export type GraphNode = {
  id: string;
  label: string;
  parent_id?: string | null;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type MindMapContent = {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ConceptMapContent = {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type PositionedNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type PositionedEdge = {
  from: string;
  to: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function isRoot(node: GraphNode): boolean {
  return node.parent_id == null;
}

function hasCycle(nodes: GraphNode[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const start of nodes) {
    const seen = new Set<string>();
    let current: GraphNode | undefined = start;
    while (current) {
      if (seen.has(current.id)) return true;
      seen.add(current.id);
      if (isRoot(current) || !current.parent_id) break;
      current = byId.get(current.parent_id);
    }
  }

  return false;
}

export function validateMindMap(content: MindMapContent): string | null {
  const { nodes } = content;
  if (nodes.length === 0) {
    return 'Mind map requires at least one node';
  }

  if (hasCycle(nodes)) {
    return 'Mind map has a cycle in parent links';
  }

  const roots = nodes.filter(isRoot);
  if (roots.length !== 1) {
    return 'Mind map requires exactly one root node';
  }

  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (isRoot(node)) continue;
    if (!node.parent_id || !ids.has(node.parent_id)) {
      return `Mind map node "${node.id}" has a missing parent`;
    }
  }

  return null;
}

export function validateConceptMap(content: ConceptMapContent): string | null {
  const { nodes, edges } = content;

  if (nodes.length < 2) {
    return 'Concept map requires at least two nodes';
  }
  if (edges.length < 1) {
    return 'Concept map requires at least one edge';
  }

  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    const label = edge.label?.trim() ?? '';
    if (!label) {
      return 'Concept map edges require a non-empty label';
    }
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      return `Concept map edge "${edge.id}" has invalid endpoints`;
    }
  }

  return null;
}

export function layoutMindMap(nodes: GraphNode[]): PositionedNode[] {
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const roots = sorted.filter(isRoot);
  const root = roots[0] ?? sorted[0];
  if (!root) return [];

  const cx = 200;
  const cy = 120;
  const radius = 90;
  const children = sorted.filter((node) => node.id !== root.id);
  const positioned: PositionedNode[] = [{ id: root.id, label: root.label, x: cx, y: cy }];

  children.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(children.length, 1) - Math.PI / 2;
    positioned.push({
      id: node.id,
      label: node.label,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    });
  });

  return positioned;
}

export function layoutConceptMap(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  const cx = 200;
  const cy = 120;
  const radius = 90;

  const positionedNodes: PositionedNode[] = sortedNodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(sortedNodes.length, 1) - Math.PI / 2;
    return {
      id: node.id,
      label: node.label,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  });

  const byId = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges: PositionedEdge[] = sortedEdges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return {
      from: edge.from,
      to: edge.to,
      label: edge.label?.trim() ?? '',
      x1: from?.x ?? cx,
      y1: from?.y ?? cy,
      x2: to?.x ?? cx,
      y2: to?.y ?? cy
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
