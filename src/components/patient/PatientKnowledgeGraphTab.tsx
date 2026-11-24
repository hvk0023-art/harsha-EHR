import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
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

const ENTITY_COLORS: Record<PatientGraphEntityType, { fill: string; stroke: string; badge: string }> = {
  Patient: { fill: '#042C53', stroke: '#042C53', badge: 'bg-[#042C53] text-white' },
  Condition: { fill: '#FEF2F2', stroke: '#B4321F', badge: 'bg-red-50 text-[#B4321F] border-red-200' },
  Allergy: { fill: '#FFF7ED', stroke: '#C97A1B', badge: 'bg-amber-50 text-[#9A5B10] border-amber-200' },
  Appointment: { fill: '#E6F1FB', stroke: '#185FA5', badge: 'bg-[#E6F1FB] text-[#042C53] border-[#85B7EB]' },
  Encounter: { fill: '#EFF6FF', stroke: '#1D4ED8', badge: 'bg-blue-50 text-blue-900 border-blue-200' },
  Observation: { fill: '#F0FDF4', stroke: '#0F6E50', badge: 'bg-teal-50 text-[#0F6E50] border-teal-200' },
  Medication: { fill: '#F5F3FF', stroke: '#6D28D9', badge: 'bg-violet-50 text-violet-900 border-violet-200' },
  'Lab Order': { fill: '#F8FAFC', stroke: '#475569', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  'Lab Result': { fill: '#ECFDF5', stroke: '#0F6E50', badge: 'bg-emerald-50 text-[#0F6E50] border-emerald-200' },
  'Imaging Report': { fill: '#F0F9FF', stroke: '#0369A1', badge: 'bg-sky-50 text-sky-900 border-sky-200' },
  Document: { fill: '#FEFCE8', stroke: '#A16207', badge: 'bg-yellow-50 text-yellow-900 border-yellow-200' },
  'Follow-Up': { fill: '#F0FDF4', stroke: '#15803D', badge: 'bg-green-50 text-green-900 border-green-200' },
  Task: { fill: '#F8FAFC', stroke: '#64748B', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
};

function clampCoord(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeNodePositions(nodes: PatientGraphNode[], edges: PatientGraphEdge[]) {
  const width = 800;
  const height = 490;
  const cx = width / 2;
  const cy = height / 2;
  const padX = 76;
  const padY = 38;

  const positions = new Map<string, { x: number; y: number }>();
  const ring1 = nodes.filter((n) => n.ring === 1);
  const ring2 = nodes.filter((n) => n.ring === 2);
  const ring1Ids = new Set(ring1.map((n) => n.id));
  const ring1Angles = new Map<string, number>();

  for (const n of nodes) {
    if (n.ring === 0) {
      positions.set(n.id, { x: cx, y: cy });
    }
  }

  // Spread ring-1 entities evenly around the center patient node
  const startAngle = -Math.PI * 0.72;
  ring1.forEach((n, idx) => {
    const angle = startAngle + (idx / Math.max(1, ring1.length)) * Math.PI * 2;
    ring1Angles.set(n.id, angle);
    const rx = 175;
    const ry = 108;
    positions.set(n.id, {
      x: clampCoord(Math.round(cx + Math.cos(angle) * rx), padX, width - padX),
      y: clampCoord(Math.round(cy + Math.sin(angle) * ry), padY, height - padY),
    });
  });

  // Group ring-2 children by their ring-1 parent so edges radiate outward cleanly
  // without ever crossing behind the central Patient box
  const childrenByParent = new Map<string, PatientGraphNode[]>();
  const orphanRing2: PatientGraphNode[] = [];

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

    if (parentId) {
      const list = childrenByParent.get(parentId) || [];
      list.push(child);
      childrenByParent.set(parentId, list);
    } else {
      orphanRing2.push(child);
    }
  }

  const rx2 = 312;
  const ry2 = 192;

  for (const [parentId, children] of childrenByParent.entries()) {
    const baseAngle = ring1Angles.get(parentId) ?? -Math.PI / 2;
    const step = children.length <= 1 ? 0 : Math.min(0.42, 1.35 / Math.max(1, children.length - 1));
    const offsetStart = -((children.length - 1) * step) / 2;
    children.forEach((child, idx) => {
      const angle = baseAngle + offsetStart + idx * step;
      positions.set(child.id, {
        x: clampCoord(Math.round(cx + Math.cos(angle) * rx2), padX, width - padX),
        y: clampCoord(Math.round(cy + Math.sin(angle) * ry2), padY, height - padY),
      });
    });
  }

  orphanRing2.forEach((n, idx) => {
    const angle = (idx / Math.max(1, orphanRing2.length)) * Math.PI * 2 + Math.PI / 6;
    positions.set(n.id, {
      x: clampCoord(Math.round(cx + Math.cos(angle) * rx2), padX, width - padX),
      y: clampCoord(Math.round(cy + Math.sin(angle) * ry2), padY, height - padY),
    });
  });

  return { width, height, positions };
}

export const PatientKnowledgeGraphTab: React.FC<PatientKnowledgeGraphTabProps> = ({ patient }) => {
  const { state, setPatientTab } = useAppState();
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
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

  const layout = useMemo(
    () => computeNodePositions(graph.nodes, graph.edges),
    [graph.edges, graph.nodes]
  );

  return (
    <div data-demo-target="patient-knowledge-graph" className="space-y-4 text-xs">
      {/* LAYER 1: PATIENT KNOWLEDGE GRAPH (STRICTLY PATIENT-DERIVED) */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Network className="w-4 h-4 text-[#185FA5]" />
              <h2 className="text-sm font-semibold text-[#042C53]">
                Patient Knowledge Graph · {patient.fullName} ({patient.mrn})
              </h2>
              <StatusBadge
                label={`${graph.nodes.length} Source-Linked Nodes · ${graph.edges.length} Relationships`}
                tone={graph.isLimitedGraph ? 'warning' : 'success'}
              />
              <StatusBadge
                label="Deterministic Graph · Derived Strictly from EHR Records"
                tone="neutral"
              />
            </div>
            <p className="text-[11px] text-[#5F5D56] mt-1">{graph.honestyNotice}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-demo-target="kg-view-graph-btn"
              onClick={() => setViewMode('graph')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium ${
                viewMode === 'graph'
                  ? 'bg-[#042C53] text-white'
                  : 'bg-white border border-slate-300 text-[#042C53]'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Interactive Graph
            </button>
            <button
              type="button"
              data-demo-target="kg-view-table-btn"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium ${
                viewMode === 'table'
                  ? 'bg-[#042C53] text-white'
                  : 'bg-white border border-slate-300 text-[#042C53]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Accessible Table View
            </button>
          </div>
        </div>

        {graph.isLimitedGraph && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9A5B10]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Limited Patient Graph:</strong> Only verified or uploaded records on file are shown. Consolidate documents in the Patient Data Inbox to enrich this patient’s graph.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPatientTab('data-inbox')}
              className="px-2.5 py-1 bg-white border border-amber-300 text-[#042C53] font-medium rounded hover:bg-amber-100"
            >
              Open Data Inbox
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Graph Canvas or Accessible Table */}
          <div className="lg:col-span-2">
            {viewMode === 'graph' ? (
              <div className="border border-slate-200 rounded-lg bg-[#F7F7F5]/60 p-2 overflow-x-auto">
                <svg
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  role="img"
                  aria-label={`Interactive Patient Knowledge Graph for ${patient.fullName}`}
                  className="w-full h-[430px] min-w-[600px]"
                >
                  {/* Edges */}
                  {graph.edges.map((edge) => {
                    const from = layout.positions.get(edge.fromId);
                    const to = layout.positions.get(edge.toId);
                    if (!from || !to) return null;
                    const highlighted =
                      activeNode &&
                      (edge.fromId === activeNode.id || edge.toId === activeNode.id);
                    const midX = (from.x + to.x) / 2;
                    const midY = (from.y + to.y) / 2;
                    return (
                      <g key={edge.id}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke={highlighted ? '#185FA5' : '#CBD5E1'}
                          strokeWidth={highlighted ? 2.2 : 1.3}
                          strokeDasharray={edge.label.includes('extracted') ? '4 2' : undefined}
                        />
                        <text
                          x={midX}
                          y={midY - 3}
                          textAnchor="middle"
                          fontSize="8.5"
                          fill={highlighted ? '#042C53' : '#64748B'}
                          fontWeight={highlighted ? 600 : 400}
                          stroke="#F7F7F5"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          {edge.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {graph.nodes.map((node) => {
                    const pos = layout.positions.get(node.id);
                    if (!pos) return null;
                    const style = ENTITY_COLORS[node.entityType];
                    const isSelected = activeNode?.id === node.id;
                    const isPatient = node.ring === 0;
                    const rx = isPatient ? 76 : 64;
                    const ry = isPatient ? 26 : 21;
                    const shortLabel =
                      node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-label={`${node.entityType}: ${node.label}`}
                        data-demo-target={`kg-node-${node.entityType.toLowerCase().replace(/\s+/g, '-')}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedNodeId(node.id);
                          }
                        }}
                      >
                        <rect
                          x={-rx}
                          y={-ry}
                          width={rx * 2}
                          height={ry * 2}
                          rx={isPatient ? 14 : 8}
                          fill={style.fill}
                          stroke={isSelected ? '#185FA5' : style.stroke}
                          strokeWidth={isSelected ? 3 : 1.5}
                        />
                        <text
                          y={-4}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight={700}
                          fill={isPatient ? '#85B7EB' : style.stroke}
                        >
                          {node.entityType.toUpperCase()}
                        </text>
                        <text
                          y={10}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight={600}
                          fill={isPatient ? '#FFFFFF' : '#042C53'}
                        >
                          {shortLabel}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Accessible Quick-Select Node Strip below SVG */}
                <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2 pb-1 border-t border-slate-200">
                  <span className="text-[10px] font-semibold text-[#5F5D56] mr-1">
                    Inspect Node:
                  </span>
                  {graph.nodes.map((node, idx) => (
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
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                        activeNode?.id === node.id
                          ? 'bg-[#042C53] text-white border-[#042C53]'
                          : 'bg-white text-[#042C53] border-slate-200 hover:border-[#185FA5]'
                      }`}
                    >
                      {node.entityType}: {node.label.slice(0, 24)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                    <tr>
                      <th className="py-2 px-3">Entity Type</th>
                      <th className="py-2 px-3">Clinical Record</th>
                      <th className="py-2 px-3">Relationship</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {graph.nodes.map((node) => (
                      <tr
                        key={node.id}
                        className={
                          activeNode?.id === node.id ? 'bg-[#E6F1FB]/60' : 'hover:bg-slate-50'
                        }
                      >
                        <td className="py-2 px-3 font-medium text-[#042C53]">{node.entityType}</td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => setSelectedNodeId(node.id)}
                            className="text-left font-medium text-[#185FA5] hover:underline"
                          >
                            {node.label}
                          </button>
                          <div className="text-[10px] text-[#5F5D56]">{node.sourceRecord}</div>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-[#444441]">{node.relationship}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[#5F5D56]">
                          {node.date}
                        </td>
                        <td className="py-2 px-3">
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
            )}
          </div>

          {/* Right Node Provenance Inspector */}
          <aside
            data-demo-target="kg-node-inspector"
            className="bg-[#F7F7F5] border border-slate-200 rounded-lg p-3.5 space-y-3 h-fit"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#042C53]">
                Node Provenance Inspector
              </span>
              <ShieldCheck className="w-4 h-4 text-[#0F6E50]" />
            </div>

            {activeNode ? (
              <div className="space-y-2.5">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${
                      ENTITY_COLORS[activeNode.entityType].badge
                    }`}
                  >
                    {activeNode.entityType}
                  </span>
                  <h3 className="text-sm font-semibold text-[#042C53] mt-1.5">
                    {activeNode.label}
                  </h3>
                  <div className="text-[11px] text-[#5F5D56]">{activeNode.sublabel}</div>
                </div>

                <dl className="space-y-1.5 text-[11px] bg-white border border-slate-200 rounded-md p-2.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Associated Patient</dt>
                    <dd className="font-medium text-[#042C53] text-right">
                      {activeNode.patientName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#5F5D56]">Relationship Path</dt>
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
                    <dd className="font-mono text-[#042C53]">{activeNode.date}</dd>
                  </div>
                  <div className="flex justify-between items-center gap-2 pt-1 border-t border-slate-100">
                    <dt className="text-[#5F5D56]">Verification Status</dt>
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

                <div className="text-[11px] text-[#444441] leading-relaxed bg-white border border-slate-200 rounded-md p-2.5">
                  {activeNode.detail}
                </div>

                <button
                  type="button"
                  onClick={() => setPatientTab(activeNode.targetTab)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
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
        className="bg-white border border-slate-200 border-l-4 border-l-[#185FA5] rounded-lg p-4 space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#185FA5]" />
              <h2 className="text-sm font-semibold text-[#042C53]">
                World Knowledge Graph Reference Layer
              </h2>
              <StatusBadge
                label="General Reference Knowledge — NOT a Patient Diagnosis or Clinical Rule"
                tone="blue"
              />
              <StatusBadge
                label="Curated Static Reference Subset (Not Live Terminology Server)"
                tone="neutral"
              />
            </div>
            <p className="text-[11px] text-[#5F5D56] mt-1 max-w-3xl">
              Strictly separated from {patient.fullName}’s personal EHR chart above. Displays a curated static subset of medical terminology metadata distinguishing WHO ICD-10 (India / Global) from US CDC/NCHS ICD-10-CM, alongside Regenstrief LOINC v2.83 (Aug 2026), KDIGO 2024, RSSDI, and HL7 FHIR R4 for documentation context only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllWorldRefs((v) => !v)}
            className="px-2.5 py-1 border border-slate-300 rounded text-[11px] font-medium text-[#042C53] hover:bg-slate-50"
          >
            {showAllWorldRefs
              ? `Show Matched Only (${relatedWorldRefs.length})`
              : `Show All Curated References (${WORLD_KNOWLEDGE_REFERENCE_ENTRIES.length})`}
          </button>
        </div>

        <div className="p-2.5 bg-[#E6F1FB]/50 border border-[#85B7EB] rounded-md text-[11px] text-[#042C53] flex items-start gap-2">
          <Info className="w-4 h-4 text-[#185FA5] shrink-0 mt-0.5" />
          <span>
            <strong>Strict Architectural Separation:</strong> Patient Knowledge Graph nodes (above) are deterministically derived from factual synthetic records on this chart. World Knowledge entries (below) are curated static terminology metadata — never LLM-inferred patient diagnoses or autonomous clinical rules.
          </span>
        </div>

        {!showAllWorldRefs && relatedWorldRefs.length === 0 ? (
          <div className="p-4 bg-[#F7F7F5] border border-slate-200 rounded-md text-[#5F5D56]">
            No general ontology mappings currently match documented terms on this patient’s chart. Click “Show All Curated References” to browse standard ICD-10 / LOINC reference concepts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                className="p-3 bg-[#F7F7F5] border border-slate-200 rounded-lg space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono font-semibold text-[#185FA5]">
                    {reference.standardCode}
                  </div>
                  <h3 className="text-xs font-semibold text-[#042C53]">{reference.concept}</h3>
                  <div className="text-[11px] font-medium text-[#444441]">
                    {reference.relationshipType}: {reference.relatedConcept}
                  </div>
                  <p className="text-[11px] text-[#5F5D56] leading-relaxed">
                    {reference.referenceSummary}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1 text-[10px]">
                  {matchedPatientTerms.length > 0 && (
                    <div className="text-[#0F6E50] font-medium">
                      Deterministic chart term overlap: {matchedPatientTerms.join(', ')}
                    </div>
                  )}
                  <div className="text-[#5F5D56]">
                    <strong>Market Scope:</strong> {reference.marketApplicability}
                  </div>
                  <div className="text-[#5F5D56]">
                    <strong>Source:</strong> {reference.sourceName} ({reference.sourceVersion})
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
