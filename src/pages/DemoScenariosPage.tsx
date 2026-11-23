import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  Hand,
  Play,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useDemoDirector } from '../demo/DemoDirectorContext';
import {
  DEMO_DIRECTOR_SCENARIOS,
  getEstimatedDurationSeconds,
  getScenarioById,
} from '../demo/demoScenarios';
import { ROLE_TUTORIAL_CARDS } from '../demo/roleWorkflowRegistry';
import type { StaffRole } from '../types/hms';
import { PageHeader, StatusBadge } from '../components/ui/Primitives';

const QUICK_START_ROLES: StaffRole[] = [
  'Front Desk',
  'Medical Assistant',
  'Nurse Practitioner',
  'Clinician',
  'Nurse / Care Coordinator',
  'Laboratory Staff',
];

export const DemoScenariosPage: React.FC = () => {
  const { startScenario, isDemoMode, activeScenario } = useDemoDirector();
  const [activeTrack, setActiveTrack] = useState<'roles' | 'journey' | 'exceptions'>('roles');
  const [startRole, setStartRole] = useState<StaffRole>('Front Desk');

  const flagship = DEMO_DIRECTOR_SCENARIOS[0];
  const flagshipDurationSec = getEstimatedDurationSeconds(flagship);
  const safetyScenarios = DEMO_DIRECTOR_SCENARIOS.filter(
    (s) => s.category === 'Safety and Exception Scenarios'
  );

  return (
    <div className="space-y-5 text-xs">
      <PageHeader
        title="EigenH Guided Demo Academy"
        subtitle="Learn every clinical workflow by watching the EHR demonstrate itself — live cursor guidance, visible data entry, AI-prepared review gates, and interactive practice (synthetic data only)"
      />

      {/* Two Prominent Primary Entry Points (Ravi & Dheeraj Product Direction) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Entry Point 1: Watch Complete Patient Journey */}
        <section
          data-demo-target="entry-complete-journey"
          className="bg-white border border-slate-200 border-t-4 border-t-[#042C53] rounded-lg p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-[#042C53] text-white rounded">
                <Compass className="w-3 h-3 text-[#85B7EB]" />
                1. Complete Patient Journey
              </span>
              <StatusBadge label="Verified working" tone="success" />
              <span className="text-[11px] font-mono tabular-nums text-[#5F5D56]">
                14 chapters · ~{flagshipDurationSec}s @ 1x · 6 roles
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#042C53] tracking-tight">
              Watch Complete Patient Journey (Elena Alvarez · MRN-109420)
            </h2>
            <p className="text-xs text-[#444441] leading-relaxed">
              Follow one consistent synthetic CKD & Hypertension patient from appointment scheduling and pre-visit intake through AI extraction, Front Desk arrival, MA rooming, NP verification, Pre-Consultation Summary, simulated Ambient Scribe, AI Clinical Action Composer, Clinician approval, Care Coordinator handoff, Lab processing, and closed-loop follow-up.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() =>
                startScenario(flagship.id, { autoPlay: true, learningMode: 'watch' })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#042C53] hover:bg-[#185FA5] text-white font-semibold rounded-md transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Watch Full Journey
            </button>
            <button
              type="button"
              onClick={() =>
                startScenario(flagship.id, { autoPlay: true, learningMode: 'executive' })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1D9E75] hover:bg-[#0F6E50] text-white font-medium rounded-md transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Executive Demo
            </button>
            <button
              type="button"
              onClick={() => setActiveTrack('journey')}
              className="inline-flex items-center gap-1 px-3 py-2 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
            >
              14-Chapter Storyboard
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Entry Point 2: Explore Workflows by Role */}
        <section
          data-demo-target="entry-explore-roles"
          className="bg-white border border-slate-200 border-t-4 border-t-[#185FA5] rounded-lg p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-[#E6F1FB] text-[#042C53] rounded">
                <GraduationCap className="w-3.5 h-3.5 text-[#185FA5]" />
                2. Explore Workflows by Role
              </span>
              <StatusBadge label="8 Role Tutorials" tone="blue" />
              <span className="text-[11px] text-[#0F6E50] font-medium">
                Watch Demo + Guided Practice
              </span>
            </div>
            <h2 className="text-base font-semibold text-[#042C53] tracking-tight">
              Interactive Screen-Share Tutorials for Every Healthcare Role
            </h2>
            <p className="text-xs text-[#444441] leading-relaxed">
              Each role tutorial glides a tutorial cursor to real buttons, visibly types into real React inputs, labels AI-prepared drafts vs human decisions, and lets staff switch into <strong>Guided Practice</strong> to click and practice every step themselves with a <strong>Show Me</strong> safety net.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() =>
                startScenario('role-front-desk', { autoPlay: true, learningMode: 'watch' })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#185FA5] hover:bg-[#042C53] text-white font-semibold rounded-md transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Front Desk Reference (10 Steps)
            </button>
            <button
              type="button"
              onClick={() =>
                startScenario('role-clinician', { autoPlay: true, learningMode: 'watch' })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#185FA5] text-[#185FA5] font-medium rounded-md hover:bg-[#E6F1FB]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Clinician AI Copilot (12 Steps)
            </button>
            <button
              type="button"
              onClick={() => setActiveTrack('roles')}
              className="inline-flex items-center gap-1 px-3 py-2 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
            >
              Browse All 8 Roles
            </button>
          </div>
        </section>
      </div>

      {/* Transparent Prototype & Safe Isolation Strip */}
      <div className="bg-[#F1EFE8] border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#444441]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0F6E50] shrink-0" />
          <span>
            <strong>Authentic UI Execution & Safe Isolation:</strong> Tutorials drive real React controls and synthetic EHR state on Elena Alvarez (MRN-109420). Your pre-demo workspace is snapshotted automatically and can be restored cleanly on exit. All AI Scribe, eligibility, eRx, and reminder steps are clearly marked simulated.
          </span>
        </div>
        {isDemoMode && activeScenario && (
          <span className="font-semibold text-[#042C53]">Active: {activeScenario.title}</span>
        )}
      </div>

      {/* Academy Section Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTrack('roles')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTrack === 'roles'
              ? 'bg-[#042C53] text-white'
              : 'bg-white border border-slate-200 text-[#5F5D56] hover:text-[#042C53]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Explore Workflows by Role (8)
        </button>
        <button
          type="button"
          onClick={() => setActiveTrack('journey')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTrack === 'journey'
              ? 'bg-[#042C53] text-white'
              : 'bg-white border border-slate-200 text-[#5F5D56] hover:text-[#042C53]'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Complete Patient Journey Storyboard (14)
        </button>
        <button
          type="button"
          onClick={() => setActiveTrack('exceptions')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTrack === 'exceptions'
              ? 'bg-[#042C53] text-white'
              : 'bg-white border border-slate-200 text-[#5F5D56] hover:text-[#042C53]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Safety & Governance Exceptions ({safetyScenarios.length})
        </button>
      </div>

      {/* TRACK 1: ALL 8 ROLE WORKFLOW TUTORIAL CARDS */}
      {activeTrack === 'roles' && (
        <section data-demo-target="role-tutorials-grid" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {ROLE_TUTORIAL_CARDS.map((card, index) => {
              const scen = getScenarioById(card.scenarioId);
              const stepCount = scen?.scenes.length ?? 0;
              const estSec = scen ? getEstimatedDurationSeconds(scen) : 0;
              const isRunning = isDemoMode && activeScenario?.id === card.scenarioId;

              return (
                <article
                  key={card.roleKey}
                  data-demo-target={`role-card-${card.roleKey}`}
                  className={`bg-white border rounded-lg p-4 flex flex-col justify-between gap-3 ${
                    isRunning
                      ? 'border-[#185FA5] ring-2 ring-[#185FA5]/20'
                      : card.referenceTutorial
                      ? 'border-[#185FA5]/60'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 bg-[#F7F7F5] border border-slate-200 text-[#042C53] rounded">
                            ROLE 0{index + 1}
                          </span>
                          {card.highlightBadge && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-[#E6F1FB] text-[#185FA5] rounded">
                              {card.highlightBadge}
                            </span>
                          )}
                          <span className="text-[10px] font-mono tabular-nums text-[#5F5D56]">
                            {stepCount} steps · ~{estSec}s
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#042C53] mt-1">
                          {card.roleTitle}
                        </h3>
                        <div className="text-[11px] text-[#185FA5] font-medium">
                          {card.actorExample} · Starts in: {card.whereWorkStarts}
                        </div>
                      </div>
                      <StatusBadge
                        label={card.readiness}
                        tone={card.readiness === 'Verified working' ? 'success' : 'blue'}
                      />
                    </div>

                    <p className="text-xs text-[#444441] leading-relaxed">{card.whatTheyDo}</p>

                    {/* Structured 5-step overview */}
                    <div className="bg-[#F7F7F5] border border-slate-200/80 rounded-md p-2.5 space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                        What you will learn step-by-step
                      </div>
                      <ol className="space-y-0.5 text-[11px] text-[#042C53]">
                        {card.mainSteps.map((step, sIdx) => (
                          <li key={sIdx} className="flex items-start gap-1.5">
                            <span className="font-mono text-[10px] text-[#185FA5] font-semibold mt-0.5">
                              {sIdx + 1}.
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* AI vs Human Boundary & Next Handoff */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded bg-teal-50/70 border border-teal-200/70">
                        <div className="font-semibold text-[#0F6E50] flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Prepares
                        </div>
                        <div className="text-[#444441] mt-0.5 leading-snug">{card.aiAssistsWith}</div>
                      </div>
                      <div className="p-2 rounded bg-amber-50/70 border border-amber-200/70">
                        <div className="font-semibold text-[#9A5B10] flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Human Decides
                        </div>
                        <div className="text-[#444441] mt-0.5 leading-snug">
                          {card.humanDecisionsRequired}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#5F5D56]">
                      <strong className="text-[#042C53]">After finishing:</strong> {card.afterFinish}
                    </div>
                  </div>

                  {/* Primary & Practice Action Buttons */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#0F6E50]">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Real DOM clicks & state verified
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          startScenario(card.scenarioId, {
                            autoPlay: false,
                            learningMode: 'practice',
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[#9A5B10] font-medium rounded-md"
                      >
                        <Hand className="w-3.5 h-3.5" />
                        Practice Workflow
                      </button>
                      <button
                        type="button"
                        data-demo-target={`watch-role-${card.roleKey}`}
                        onClick={() =>
                          startScenario(card.scenarioId, {
                            autoPlay: true,
                            learningMode: 'watch',
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-semibold rounded-md"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Watch Demo
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TRACK 2: COMPLETE 14-SCENE PATIENT JOURNEY STORYBOARD */}
      {activeTrack === 'journey' && (
        <section
          data-demo-target="flagship-demo-card"
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label="Flagship Complete Patient Journey" tone="blue" />
                <span className="text-[11px] font-mono tabular-nums text-[#5F5D56]">
                  {flagship.scenes.length} chapters · ~{flagshipDurationSec}s @ 1x · Elena Alvarez (MRN-109420)
                </span>
              </div>
              <h2 className="text-base font-semibold text-[#042C53]">{flagship.title}</h2>
              <p className="text-xs text-[#444441] leading-relaxed">{flagship.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="flagship-role-start" className="sr-only">
                Start full journey from selected role
              </label>
              <select
                id="flagship-role-start"
                value={startRole}
                onChange={(e) => setStartRole(e.target.value as StaffRole)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs text-[#042C53]"
              >
                {QUICK_START_ROLES.map((r) => (
                  <option key={r} value={r}>
                    Jump to Role: {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  startScenario(flagship.id, {
                    startRole,
                    autoPlay: true,
                    learningMode: 'watch',
                  })
                }
                className="px-3 py-1.5 bg-[#042C53] hover:bg-[#185FA5] text-white font-medium rounded-md"
              >
                Start From Role
              </button>
              <button
                type="button"
                onClick={() =>
                  startScenario(flagship.id, {
                    autoPlay: false,
                    learningMode: 'practice',
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-amber-300 bg-amber-50 text-[#9A5B10] font-medium rounded-md hover:bg-amber-100"
              >
                <Hand className="w-3.5 h-3.5" />
                Guided Practice
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-[#5F5D56] mb-2">
              Click any chapter below to launch directly at that exact verified checkpoint:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {flagship.scenes.map((scene, idx) => (
                <button
                  key={scene.sceneId}
                  type="button"
                  onClick={() =>
                    startScenario(flagship.id, {
                      startIndex: idx,
                      autoPlay: false,
                      learningMode: 'watch',
                    })
                  }
                  className="text-left p-2.5 rounded border border-slate-200 hover:border-[#185FA5] hover:bg-[#E6F1FB]/40 transition-colors bg-[#F7F7F5]"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#5F5D56]">
                    <span>{String(scene.sceneNumber).padStart(2, '0')}</span>
                    <span
                      className={
                        scene.actorKind === 'ai'
                          ? 'text-[#0F6E50] font-semibold'
                          : scene.actorKind === 'handoff'
                          ? 'text-[#185FA5] font-semibold'
                          : 'text-[#5F5D56]'
                      }
                    >
                      {scene.actorKind === 'ai'
                        ? 'AI'
                        : scene.actorKind === 'handoff'
                        ? 'Handoff'
                        : 'Human'}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-[#042C53] line-clamp-2 mt-1 leading-snug">
                    {scene.title}
                  </div>
                  <div className="text-[10px] text-[#5F5D56] truncate mt-0.5">{scene.role}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TRACK 3: CLINICAL SAFETY & GOVERNANCE EXCEPTIONS */}
      {activeTrack === 'exceptions' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {safetyScenarios.map((scen) => {
            const durSec = getEstimatedDurationSeconds(scen);
            return (
              <article
                key={scen.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono text-[#5F5D56]">
                        EXCEPTION {scen.number} · {scen.scenes.length} steps
                      </div>
                      <h3 className="text-sm font-semibold text-[#042C53] mt-0.5">{scen.title}</h3>
                      <div className="text-[11px] text-[#185FA5] font-medium">{scen.subtitle}</div>
                    </div>
                    <StatusBadge label="Verified working" tone="success" />
                  </div>
                  <p className="text-xs text-[#444441] leading-relaxed">{scen.description}</p>
                  <div className="text-[11px] text-[#5F5D56] flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#185FA5]" />
                      {scen.participatingRoles.join(' · ')}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5" />~{durSec}s @ 1x
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#0F6E50] inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Human safety guard verified
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        startScenario(scen.id, { autoPlay: false, learningMode: 'practice' })
                      }
                      className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-[#9A5B10] font-medium rounded-md hover:bg-amber-100"
                    >
                      Practice
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startScenario(scen.id, { autoPlay: true, learningMode: 'watch' })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-semibold rounded-md"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Watch Demo
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};
