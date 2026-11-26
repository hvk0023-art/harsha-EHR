import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
  Filter,
  Focus,
  GitBranch,
  Info,
  List,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import {
  buildPatientKnowledgeGraph,
  findRelatedWorldReferences,
  type PatientGraphEdge,
  type PatientGraphEntityType,
  type PatientGraphNode,
  WORLD_KNOWLEDGE_REFERENCE_ENTRIES,
} from '../../state/knowledgeGraph';
import type { Patient } from '../../types/hms';
import { StatusBadge } from '../ui/Primitives';

interface PatientKnowledgeGraphTabProps {
  patient: Patient;
}

const ENTITY_STYLES: Record<
  PatientGraphEntityType,
  { accent: string; tint: string; badge: string; dot: string }
> = {
  Patient: {
    accent: '#042C53',
    tint: '#042C53',
    badge: 'bg-[#042C53] text-white border-[#042C53]',
    dot: 'bg-[#042C53]',
  },
  Condition: {
    accent: '#B4321F',
    tint: '#FEF2F2',
    badge: 'bg-red-50 text-[#B4321F] border-red-200/80',
    dot: 'bg-[#B4321F]',
  },
  Allergy: {
    accent: '#C97A1B',
    tint: '#FFF7ED',
    badge: 'bg-amber-50 text-[#9A5B10] border-amber-200/80',
    dot: 'bg-[#C97A1B]',
  },
  Appointment: {
    accent: '#185FA5',
    tint: '#E6F1FB',
    badge: 'bg-[#E6F1FB] text-[#042C53] border-[#85B7EB]/80',
    dot: 'bg-[#185FA5]',
  },
  Encounter: {
    accent: '#378ADD',
    tint: '#EFF6FF',
    badge: 'bg-[#E6F1FB] text-[#185FA5] border-[#85B7EB]/80',
    dot: 'bg-[#378ADD]',
  },
  Observation: {
    accent: '#0F6E50',
    tint: '#ECFDF5',
    badge: 'bg-emerald-50 text-[#0F6E50] border-emerald-200/80',
    dot: 'bg-[#0F6E50]',
  },
  Medication: {
    accent: '#1D9E75',
    tint: '#ECFDF5',
    badge: 'bg-teal-50 text-[#0F6E50] border-teal-200/80',
    dot: 'bg-[#1D9E75]',
  },
  'Lab Order': {
    accent: '#475569',
    tint: '#F8FAFC',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
  },
  'Lab Result': {
    accent: '#0F6E50',
    tint: '#ECFDF5',
    badge: 'bg-emerald-50 text-[#0F6E50] border-emerald-200/80',
    dot: 'bg-[#0F6E50]',
  },
  'Imaging Report': {
    accent: '#0369A1',
    tint: '#F0F9FF',
    badge: 'bg-sky-50 text-sky-900 border-sky-200/80',
    dot: 'bg-[#0369A1]',
  },
  Document: {
    accent: '#B45309',
    tint: '#FFFBEB',
    badge: 'bg-amber-50 text-[#9A5B10] border-amber-200/80',
    dot: 'bg-[#C97A1B]',
  },
  'Follow-Up': {
    accent: '#15803D',
    tint: '#F0FDF4',
    badge: 'bg-emerald-50 text-[#0F6E50] border-emerald-200/80',
    dot: 'bg-[#1D9E75]',
  },
  Task: {
    accent: '#64748B',
    tint: '#F8FAFC',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
  },
};

const LEFT_WING_TYPES = new Set<PatientGraphEntityType>([
  'Condition',
  'Allergy',
  'Medication',
  'Observation',
  'Follow-Up',
  'Task',
]);

interface NodePosition {
  x: number;
  y: number;
  side: 'center' | 'left' | 'right';
}

function distributeColumnY(count: number, totalHeight: number, minGap: number): number[] {
  if (count === 0) return [];
  const topPad = 68;
  const bottomPad = 42;
  if (count === 1) return [Math.round(topPad + (totalHeight - topPad - bottomPad) / 2)];
  const usable = Math.max((count - 1) * minGap, totalHeight - topPad - bottomPad);
  const step = usable / (count - 1);
  return Array.from({ length: count }, (_, idx) => Math.round(topPad + idx * step));
}

function computeStructuredGraphLayout(
  nodes: PatientGraphNode[],
  edges: PatientGraphEdge[]
) {
  const width = 960;
  const minGap = 62;
  const positions = new Map<string, NodePosition>();

  const centerNode = nodes.find((n) => n.ring === 0);
  const ring1 = nodes.filter((n) => n.ring === 1);
  const ring2 = nodes.filter((n) => n.ring === 2);
  const ring1Ids = new Set(ring1.map((n) => n.id));

  // Partition ring-1 nodes into balanced left (clinical profile) and right (visits & records) wings
  const leftRing1: PatientGraphNode[] = [];
  const rightRing1: PatientGraphNode[] = [];

  for (const n of ring1) {
    if (LEFT_WING_TYPES.has(n.entityType)) {
      leftRing1.push(n);
    } else {
      rightRing1.push(n);
    }
  }

  // Attach ring-2 children to their connected parent's wing to prevent cross-canvas line tangles
  const leftSideIds = new Set(leftRing1.map((n) => n.id));
  const rightSideIds = new Set(rightRing1.map((n) => n.id));
  const leftRing2: PatientGraphNode[] = [];
  const rightRing2: PatientGraphNode[] = [];

  for (const child of ring2) {
    const parentEdge = edges.find(
      (e) =>
        (e.toId === child.id && ring1Ids.has(e.fromId)) ||
        (e.fromId === child.id && ring1Ids.has(e.toId))
    );
    const parentId = parentEdge
      ? ring1Ids.has(parentEdge.fromId)
        ? parentEdge.fromId
        : parentEdge.toId
      : null;

    if (parentId && leftSideIds.has(parentId)) {
      leftRing2.push(child);
    } else if (parentId && rightSideIds.has(parentId)) {
      rightRing2.push(child);
    } else if (LEFT_WING_TYPES.has(child.entityType)) {
      leftRing2.push(child);
    } else {
      rightRing2.push(child);
    }
  }

  const maxColumnCount = Math.max(
    1,
    leftRing1.length,
    rightRing1.length,
    leftRing2.length,
    rightRing2.length
  );
  const height = Math.max(480, maxColumnCount * minGap + 124);
  const cx = Math.round(width / 2);
  const cy = Math.round(68 + (height - 110) / 2);

  if (centerNode) {
    positions.set(centerNode.id, { x: cx, y: cy, side: 'center' });
  }

  const hasLeftOuter = leftRing2.length > 0;
  const hasRightOuter = rightRing2.length > 0;

  const leftInnerX = hasLeftOuter ? 282 : 240;
  const leftOuterX = 96;
  const rightInnerX = hasRightOuter ? 678 : 720;
  const rightOuterX = 864;

  const left1Ys = distributeColumnY(leftRing1.length, height, minGap);
  leftRing1.forEach((n, idx) => {
    positions.set(n.id, { x: leftInnerX, y: left1Ys[idx], side: 'left' });
  });

  const right1Ys = distributeColumnY(rightRing1.length, height, minGap);
  rightRing1.forEach((n, idx) => {
    positions.set(n.id, { x: rightInnerX, y: right1Ys[idx], side: 'right' });
  });

  // Sort ring-2 nodes by their parent's Y coordinate to eliminate crossing edges
  const sortByParentY = (list: PatientGraphNode[]) =>
    [...list].sort((a, b) => {
      const getParentY = (node: PatientGraphNode) => {
        const edge = edges.find(
          (e) =>
            (e.toId === node.id && positions.has(e.fromId)) ||
            (e.fromId === node.id && positions.has(e.toId))
        );
        if (!edge) return cy;
        const pid = edge.fromId === node.id ? edge.toId : edge.fromId;
        return positions.get(pid)?.y ?? cy;
      };
      return getParentY(a) - getParentY(b);
    });

  const sortedLeft2 = sortByParentY(leftRing2);
  const left2Ys = distributeColumnY(sortedLeft2.length, height, minGap);
  sortedLeft2.forEach((n, idx) => {
    positions.set(n.id, { x: leftOuterX, y: left2Ys[idx], side: 'left' });
  });

  const sortedRight2 = sortByParentY(rightRing2);
  const right2Ys = distributeColumnY(sortedRight2.length, height, minGap);
  sortedRight2.forEach((n, idx) => {
    positions.set(n.id, { x: rightOuterX, y: right2Ys[idx], side: 'right' });
  });

  return { width, height, positions };
}

export const PatientKnowledgeGraphTab: React.FC<PatientKnowledgeGraphTabProps> = ({ patient }) => {
  const { state, setPatientTab } = useAppState();
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<PatientGraphEntityType | 'All'>('All');
  const [focusNeighborhood, setFocusNeighborhood] = useState<boolean>(false);
  const [showAllWorldRefs, setShowAllWorldRefs] = useState(false);

  const graph = useMemo(
    () => buildPatientKnowledgeGraph(state, patient.id),
    [patient.id, state]
  );

  const relatedWorldRefs = useMemo(
    () => findRelatedWorldReferences(state, patient.id),
    [patient.id, state]
  );

  const activeNode: PatientGraphNode | undefined =
    graph.nodes.find((n) => n.id === selectedNodeId) ||
    graph.nodes.find((n) => n.entityType === 'Lab Result') ||
    graph.nodes.find((n) => n.entityType === 'Document') ||
    graph.nodes[0];

  // Category counts for left filter rail
  const categoryCounts = useMemo(() => {
    const counts = new Map<PatientGraphEntityType, number>();
    for (const node of graph.nodes) {
      if (node.entityType === 'Patient') continue;
      counts.set(node.entityType, (counts.get(node.entityType) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [graph.nodes]);

  // Compute visible nodes/edges according to category filter & focus mode
  const filteredGraph = useMemo(() => {
    const connectedIds = new Set<string>();
    if (activeNode) {
      connectedIds.add(activeNode.id);
      for (const e of graph.edges) {
        if (e.fromId === activeNode.id) connectedIds.add(e.toId);
        if (e.toId === activeNode.id) connectedIds.add(e.fromId);
      }
    }

    const visibleNodes = graph.nodes.filter((n) => {
      if (n.ring === 0) return true;
      if (activeNode && n.id === activeNode.id) return true;
      if (categoryFilter !== 'All' && n.entityType !== categoryFilter) {
        // Keep direct parent/child if focusNeighborhood is off? No, honor category filter cleanly
        return false;
      }
      if (focusNeighborhood && activeNode && !connectedIds.has(n.id)) {
        return false;
      }
      return true;
    });

    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter(
      (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId)
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [activeNode, categoryFilter, focusNeighborhood, graph.edges, graph.nodes]);

  const layout = useMemo(
    () => computeStructuredGraphLayout(filteredGraph.nodes, filteredGraph.edges),
    [filteredGraph.edges, filteredGraph.nodes]
  );

  const spotlightNodeId = hoveredNodeId || activeNode?.id || null;
  const spotlightNeighborIds = useMemo(() => {
    const ids = new Set<string>();
    if (!spotlightNodeId) return ids;
    ids.add(spotlightNodeId);
    for (const edge of filteredGraph.edges) {
      if (edge.fromId === spotlightNodeId) ids.add(edge.toId);
      if (edge.toId === spotlightNodeId) ids.add(edge.fromId);
    }
    return ids;
  }, [filteredGraph.edges, spotlightNodeId]);

  return (
    <div data-demo-target="patient-knowledge-graph" className="space-y-5 text-xs">
      {/* LAYER 1: PATIENT KNOWLEDGE GRAPH (STRICTLY PATIENT-DERIVED) */}
      <section className="eigen-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center shrink-0">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[#042C53]">
                    Patient Knowledge Graph
                  </h2>
                  <span className="font-mono text-[11px] text-[#5F5D56] bg-[#F6F6F2] border border-[#042C53]/10 px-2 py-0.5 rounded-full">
                    {patient.fullName} · {patient.mrn}
                  </span>
                  <StatusBadge
                    label={`${graph.nodes.length} Source-Linked Nodes · ${graph.edges.length} Relationships`}
                    tone={graph.isLimitedGraph ? 'warning' : 'success'}
                  />
                  <StatusBadge
                    label="Deterministic EHR Graph"
                    tone="neutral"
                  />
                </div>
                <p className="text-xs text-[#5F5D56] mt-1 max-w-3xl">{graph.honestyNotice}</p>
              </div>
            </div>
          </div>

          <div className="inline-flex items-center p-1 bg-[#F6F6F2] rounded-xl border border-[#042C53]/8">
            <button
              type="button"
              data-demo-target="kg-view-graph-btn"
              onClick={() => setViewMode('graph')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'graph'
                  ? 'bg-white text-[#042C53] shadow-xs ring-1 ring-[#042C53]/8'
                  : 'text-[#5F5D56] hover:text-[#042C53]'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Interactive Graph
            </button>
            <button
              type="button"
              data-demo-target="kg-view-table-btn"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#042C53] shadow-xs ring-1 ring-[#042C53]/8'
                  : 'text-[#5F5D56] hover:text-[#042C53]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Accessible Table View
            </button>
          </div>
        </div>

        {graph.isLimitedGraph && (
          <div className="p-3.5 bg-amber-50/75 border border-amber-200/90 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-[#9A5B10]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Limited Patient Graph:</strong> Only verified or uploaded records on file are shown. Consolidate documents in the Patient Data Inbox to enrich this patient’s graph.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPatientTab('data-inbox')}
              className="eigen-btn-secondary text-xs py-1.5 px-3"
            >
              Open Data Inbox
            </button>
          </div>
        )}

        {/* 3-Column Clinical Graph Explorer: Left Filters & Quick List | Center Canvas/Table | Right Provenance Inspector */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left Rail: Category Filters + Quick Node Jump */}
          <aside className="xl:col-span-3 space-y-3">
            <div className="eigen-card-subtle p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                  <Filter className="w-3.5 h-3.5 text-[#185FA5]" />
                  Entity Filters
                </span>
                {categoryFilter !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('All')}
                    className="text-[11px] font-medium text-[#185FA5] hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('All')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    categoryFilter === 'All'
                      ? 'bg-[#042C53] text-white border-[#042C53]'
                      : 'bg-white text-[#042C53] border-[#042C53]/12 hover:border-[#185FA5]'
                  }`}
                >
                  All ({graph.nodes.length - 1})
                </button>
                {categoryCounts.map(([type, count]) => {
                  const style = ENTITY_STYLES[type];
                  const active = categoryFilter === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCategoryFilter(active ? 'All' : type)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        active
                          ? 'bg-[#042C53] text-white border-[#042C53]'
                          : 'bg-white text-[#042C53] border-[#042C53]/12 hover:border-[#185FA5]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#85B7EB]' : style.dot}`}
                      />
                      {type}
                      <span className={active ? 'text-white/80 font-mono' : 'text-[#5F5D56] font-mono'}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[#042C53]/8 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#042C53]">
                  <Focus className="w-3.5 h-3.5 text-[#185FA5]" />
                  Isolate Selected Branch
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={focusNeighborhood}
                  onClick={() => setFocusNeighborhood((v) => !v)}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    focusNeighborhood ? 'bg-[#185FA5]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                      focusNeighborhood ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Accessible Quick-Select Node List (preserves all Demo Academy inspect targets) */}
            <div className="eigen-card-subtle p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                  Source-Linked Nodes ({graph.nodes.length})
                </span>
              </div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {graph.nodes.map((node, idx) => {
                  const isSelected = activeNode?.id === node.id;
                  const style = ENTITY_STYLES[node.entityType];
                  return (
                    <button
                      key={node.id}
                      type="button"
                      data-demo-target={
                        node.entityType === 'Lab Result'
                          ? 'kg-inspect-lab-btn'
                          : node.entityType === 'Document'
                          ? 'kg-inspect-doc-btn'
                          : `kg-node-pill-${idx}`
                      }
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        if (categoryFilter !== 'All' && node.entityType !== categoryFilter && node.ring !== 0) {
                          setCategoryFilter('All');
                        }
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl border transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'bg-white border-[#185FA5] shadow-xs ring-1 ring-[#185FA5]/20'
                          : 'bg-white/60 border-transparent hover:bg-white hover:border-[#042C53]/12'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56] truncate">
                          {node.entityType}
                        </div>
                        <div className="text-[11px] font-semibold text-[#042C53] truncate">
                          {node.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Center Canvas or Accessible Table */}
          <div className="xl:col-span-6 min-w-0">
            {viewMode === 'graph' ? (
              <div className="rounded-2xl border border-[#042C53]/10 bg-[#FAF9F6] overflow-hidden">
                <div className="px-3.5 py-2 border-b border-[#042C53]/8 bg-white/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F5D56]">
                  <span>
                    Showing <strong className="text-[#042C53]">{filteredGraph.nodes.length}</strong> of{' '}
                    {graph.nodes.length} nodes · Click any node to trace provenance
                  </span>
                  <span className="font-mono text-[10px] text-[#5F5D56]">
                    Dashed edge = Extracted from document
                  </span>
                </div>
                <div className="overflow-x-auto p-2">
                  <svg
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    role="img"
                    aria-label={`Interactive Patient Knowledge Graph for ${patient.fullName}`}
                    className="w-full h-auto"
                  >
                    <defs>
                      <filter id="kg-card-shadow" x="-10%" y="-15%" width="120%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#042C53" floodOpacity="0.07" />
                      </filter>
                    </defs>

                    {/* Subtle Structural Zone Guides */}
                    <text
                      x={190}
                      y={24}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={600}
                      fill="#8B8981"
                      letterSpacing="0.08em"
                    >
                      CLINICAL PROFILE & CARE PLAN
                    </text>
                    <text
                      x={480}
                      y={24}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={600}
                      fill="#8B8981"
                      letterSpacing="0.08em"
                    >
                      PATIENT HUB
                    </text>
                    <text
                      x={770}
                      y={24}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={600}
                      fill="#8B8981"
                      letterSpacing="0.08em"
                    >
                      VISITS, LABS & DOCUMENTS
                    </text>

                    {/* Curved Bezier Edges */}
                    {filteredGraph.edges.map((edge) => {
                      const from = layout.positions.get(edge.fromId);
                      const to = layout.positions.get(edge.toId);
                      if (!from || !to) return null;
                      const highlighted =
                        spotlightNodeId !== null &&
                        (edge.fromId === spotlightNodeId || edge.toId === spotlightNodeId);
                      const dimmed = spotlightNodeId !== null && !highlighted;

                      const dx = to.x - from.x;
                      const c1x = from.x + dx * 0.48;
                      const c2x = to.x - dx * 0.48;
                      const d = `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
                      const midX = (from.x + to.x) / 2;
                      const midY = (from.y + to.y) / 2;

                      return (
                        <g key={edge.id} opacity={dimmed ? 0.25 : 1}>
                          <path
                            d={d}
                            fill="none"
                            stroke={highlighted ? '#185FA5' : '#C6CDD6'}
                            strokeWidth={highlighted ? 2.2 : 1.35}
                            strokeDasharray={edge.label.includes('extracted') ? '5 3' : undefined}
                          />
                          {highlighted && (
                            <g transform={`translate(${midX}, ${midY})`}>
                              <rect
                                x={-48}
                                y={-10}
                                width={96}
                                height={18}
                                rx={9}
                                fill="#FFFFFF"
                                stroke="#85B7EB"
                                strokeWidth={1}
                              />
                              <text
                                y={2.5}
                                textAnchor="middle"
                                fontSize="8.5"
                                fill="#042C53"
                                fontWeight={600}
                              >
                                {edge.label.length > 18 ? `${edge.label.slice(0, 16)}…` : edge.label}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {/* Clean Non-Overlapping Node Cards */}
                    {filteredGraph.nodes.map((node) => {
                      const pos = layout.positions.get(node.id);
                      if (!pos) return null;
                      const style = ENTITY_STYLES[node.entityType];
                      const isSelected = activeNode?.id === node.id;
                      const isPatient = node.ring === 0;
                      const isConnected =
                        !spotlightNodeId || spotlightNeighborIds.has(node.id);

                      const cardW = isPatient ? 172 : 160;
                      const cardH = isPatient ? 58 : 48;
                      const halfW = cardW / 2;
                      const halfH = cardH / 2;
                      const shortLabel =
                        node.label.length > 21 ? `${node.label.slice(0, 19)}…` : node.label;

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${pos.x}, ${pos.y})`}
                          opacity={isConnected ? 1 : 0.42}
                          onClick={() => setSelectedNodeId(node.id)}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          className="cursor-pointer transition-opacity"
                          role="button"
                          tabIndex={0}
                          aria-label={`${node.entityType}: ${node.label}`}
                          data-demo-target={`kg-node-${node.entityType
                            .toLowerCase()
                            .replace(/\s+/g, '-')}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedNodeId(node.id);
                            }
                          }}
                        >
                          {isSelected && (
                            <rect
                              x={-halfW - 4}
                              y={-halfH - 4}
                              width={cardW + 8}
                              height={cardH + 8}
                              rx={isPatient ? 18 : 14}
                              fill="none"
                              stroke="#185FA5"
                              strokeOpacity={0.28}
                              strokeWidth={3}
                            />
                          )}
                          <rect
                            x={-halfW}
                            y={-halfH}
                            width={cardW}
                            height={cardH}
                            rx={isPatient ? 14 : 11}
                            fill={isPatient ? '#042C53' : '#FFFFFF'}
                            stroke={isSelected ? '#185FA5' : isPatient ? '#042C53' : '#DDE2E8'}
                            strokeWidth={isSelected ? 2.2 : 1.15}
                            filter="url(#kg-card-shadow)"
                          />
                          {/* Semantic left accent pill on non-patient cards */}
                          {!isPatient && (
                            <rect
                              x={-halfW + 7}
                              y={-halfH + 9}
                              width={3.5}
                              height={cardH - 18}
                              rx={2}
                              fill={style.accent}
                            />
                          )}
                          <text
                            x={isPatient ? 0 : -halfW + 17}
                            y={isPatient ? -7 : -5}
                            textAnchor={isPatient ? 'middle' : 'start'}
                            fontSize="8.5"
                            fontWeight={700}
                            letterSpacing="0.04em"
                            fill={isPatient ? '#85B7EB' : style.accent}
                          >
                            {node.entityType.toUpperCase()}
                          </text>
                          <text
                            x={isPatient ? 0 : -halfW + 17}
                            y={isPatient ? 11 : 10}
                            textAnchor={isPatient ? 'middle' : 'start'}
                            fontSize={isPatient ? '11.5' : '10.5'}
                            fontWeight={600}
                            fill={isPatient ? '#FFFFFF' : '#042C53'}
                          >
                            {shortLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#042C53]/10 overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="eigen-table-head">
                      <tr>
                        <th className="py-2.5 px-3.5">Entity Type</th>
                        <th className="py-2.5 px-3.5">Clinical Record</th>
                        <th className="py-2.5 px-3.5">Relationship</th>
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3.5">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#042C53]/6">
                      {filteredGraph.nodes.map((node) => (
                        <tr
                          key={node.id}
                          className={
                            activeNode?.id === node.id
                              ? 'bg-[#E6F1FB]/55'
                              : 'hover:bg-[#FAF9F6] transition-colors'
                          }
                        >
                          <td className="py-2.5 px-3.5 font-medium text-[#042C53]">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  ENTITY_STYLES[node.entityType].dot
                                }`}
                              />
                              {node.entityType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className="text-left font-semibold text-[#185FA5] hover:underline"
                            >
                              {node.label}
                            </button>
                            <div className="text-[10px] font-mono text-[#5F5D56]">
                              {node.sourceRecord}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 text-[11px] text-[#444441]">
                            {node.relationship}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#5F5D56] tabular-nums">
                            {node.date}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <StatusBadge
                              label={node.verificationStatus}
                              tone={
                                node.verificationStatus === 'Verified'
                                  ? 'success'
                                  : node.verificationStatus === 'AI-Extracted'
                                  ? 'blue'
                                  : 'warning'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Rail: Node Provenance Inspector */}
          <aside
            data-demo-target="kg-node-inspector"
            className="xl:col-span-3 eigen-card-subtle p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#042C53]/8">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#042C53]">
                Node Provenance Inspector
              </span>
              <ShieldCheck className="w-4 h-4 text-[#0F6E50]" />
            </div>

            {activeNode ? (
              <div className="space-y-3">
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-semibold rounded-full border ${
                      ENTITY_STYLES[activeNode.entityType].badge
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ENTITY_STYLES[activeNode.entityType].dot}`} />
                    {activeNode.entityType}
                  </span>
                  <h3 className="text-sm font-semibold text-[#042C53] mt-2 leading-snug">
                    {activeNode.label}
                  </h3>
                  <div className="text-[11px] text-[#5F5D56] mt-0.5">{activeNode.sublabel}</div>
                </div>

                <dl className="space-y-2 text-[11px] bg-white border border-[#042C53]/8 rounded-xl p-3">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Patient</dt>
                    <dd className="font-medium text-[#042C53] text-right">
                      {activeNode.patientName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Relationship</dt>
                    <dd className="font-medium text-[#042C53] text-right">
                      {activeNode.relationship}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Source Record</dt>
                    <dd className="font-mono text-[#042C53] text-right">
                      {activeNode.sourceRecord}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Record Date</dt>
                    <dd className="font-mono text-[#042C53] tabular-nums">{activeNode.date}</dd>
                  </div>
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-[#042C53]/6">
                    <dt className="text-[#5F5D56]">Verification</dt>
                    <dd>
                      <StatusBadge
                        label={activeNode.verificationStatus}
                        tone={
                          activeNode.verificationStatus === 'Verified'
                            ? 'success'
                            : activeNode.verificationStatus === 'AI-Extracted'
                            ? 'blue'
                            : 'warning'
                        }
                      />
                    </dd>
                  </div>
                </dl>

                <div className="text-[11px] text-[#444441] leading-relaxed bg-white border border-[#042C53]/8 rounded-xl p-3">
                  {activeNode.detail}
                </div>

                <button
                  type="button"
                  onClick={() => setPatientTab(activeNode.targetTab)}
                  className="eigen-btn-primary w-full justify-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Source Tab ({activeNode.targetTab.replace(/-/g, ' ')})
                </button>
              </div>
            ) : (
              <p className="text-[#5F5D56]">Select any node to inspect its clinical provenance.</p>
            )}
          </aside>
        </div>
      </section>

      {/* LAYER 2: WORLD KNOWLEDGE GRAPH REFERENCE LAYER (STRICTLY SEPARATED) */}
      <section
        data-demo-target="world-knowledge-reference-layer"
        className="eigen-card p-5 space-y-4 bg-[#FAF9F6]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white border border-[#042C53]/10 text-[#185FA5] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[#042C53]">
                  World Knowledge Graph Reference Layer
                </h2>
                <StatusBadge
                  label="General Reference Knowledge — NOT a Patient Diagnosis or Clinical Rule"
                  tone="blue"
                />
                <StatusBadge
                  label="Curated Static Reference Subset"
                  tone="neutral"
                />
              </div>
              <p className="text-xs text-[#5F5D56] mt-1 max-w-3xl leading-relaxed">
                Strictly separated from {patient.fullName}’s personal EHR chart above. Displays a curated static subset of medical terminology metadata distinguishing WHO ICD-10 (India / Global) from US CDC/NCHS ICD-10-CM, alongside Regenstrief LOINC v2.83 (Aug 2026), KDIGO 2024, RSSDI, and HL7 FHIR R4 for documentation context only.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllWorldRefs((v) => !v)}
            className="eigen-btn-secondary text-xs shrink-0"
          >
            {showAllWorldRefs
              ? `Show Matched Only (${relatedWorldRefs.length})`
              : `Show All Curated References (${WORLD_KNOWLEDGE_REFERENCE_ENTRIES.length})`}
          </button>
        </div>

        <div className="p-3 bg-[#E6F1FB]/55 border border-[#85B7EB]/60 rounded-xl text-xs text-[#042C53] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#185FA5] shrink-0 mt-0.5" />
          <span>
            <strong>Strict Architectural Separation:</strong> Patient Knowledge Graph nodes (above) are deterministically derived from factual synthetic records on this chart. World Knowledge entries (below) are curated static terminology metadata — never LLM-inferred patient diagnoses or autonomous clinical rules.
          </span>
        </div>

        {!showAllWorldRefs && relatedWorldRefs.length === 0 ? (
          <div className="p-5 bg-white border border-[#042C53]/8 rounded-xl text-[#5F5D56] text-xs">
            No general ontology mappings currently match documented terms on this patient’s chart. Click “Show All Curated References” to browse standard ICD-10 / LOINC reference concepts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {(showAllWorldRefs
              ? WORLD_KNOWLEDGE_REFERENCE_ENTRIES.map((reference) => ({
                  reference,
                  matchedPatientTerms:
                    relatedWorldRefs.find((r) => r.reference.id === reference.id)
                      ?.matchedPatientTerms || [],
                }))
              : relatedWorldRefs
            ).map(({ reference, matchedPatientTerms }) => (
              <article
                key={reference.id}
                className="p-4 bg-white border border-[#042C53]/8 rounded-xl shadow-[0_1px_2px_rgba(4,44,83,0.03)] space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="inline-block px-2 py-0.5 rounded-md bg-[#E6F1FB] text-[10px] font-mono font-semibold text-[#185FA5]">
                    {reference.standardCode}
                  </div>
                  <h3 className="text-[13px] font-semibold text-[#042C53] leading-snug">
                    {reference.concept}
                  </h3>
                  <div className="text-[11px] font-medium text-[#444441]">
                    {reference.relationshipType}: {reference.relatedConcept}
                  </div>
                  <p className="text-[11px] text-[#5F5D56] leading-relaxed">
                    {reference.referenceSummary}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-[#042C53]/6 space-y-1 text-[10px]">
                  {matchedPatientTerms.length > 0 && (
                    <div className="text-[#0F6E50] font-semibold">
                      Chart term overlap: {matchedPatientTerms.join(', ')}
                    </div>
                  )}
                  <div className="text-[#5F5D56]">
                    <strong className="text-[#042C53]">Market Scope:</strong>{' '}
                    {reference.marketApplicability}
                  </div>
                  <div className="text-[#5F5D56]">
                    <strong className="text-[#042C53]">Source:</strong> {reference.sourceName} (
                    {reference.sourceVersion})
                  </div>
                  <div className="text-[#9A5B10] italic">{reference.governanceDisclaimer}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
