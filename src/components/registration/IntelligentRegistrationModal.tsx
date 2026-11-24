import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Info,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { useAppState } from '../../state/AppStateContext';
import {
  computeRegistrationCompleteness,
  evaluateDuplicateSafety,
  mergeVerifiedPatientFields,
} from '../../state/registrationIntelligence';
import type { FieldProvenanceEntry, Patient } from '../../types/hms';
import { Modal, StatusBadge } from '../ui/Primitives';

interface IntelligentRegistrationModalProps {
  open: boolean;
  onClose: () => void;
  defaultFacilityId?: string;
  onRegistered?: (patient: Patient) => void;
}

const DEMO_PREFILL_PRESET = {
  fullName: 'Aarav Mehta',
  dob: '1979-08-15',
  sex: 'Male' as const,
  phone: '+91 98452 33109',
  email: 'aarav.mehta.demo@example.in',
  address: '42 12th Main Rd, Indiranagar, Bengaluru 560038',
  chiefConcern: 'Scheduled preventive diabetes & metabolic review (bringing outside lab reports)',
  preferredLanguage: 'English / Kannada',
  emergencyContactName: 'Meera Mehta',
  emergencyContactRelation: 'Spouse',
  emergencyContactPhone: '+91 98452 33110',
  abhaId: '',
};

export const IntelligentRegistrationModal: React.FC<IntelligentRegistrationModalProps> = ({
  open,
  onClose,
  defaultFacilityId,
  onRegistered,
}) => {
  const {
    state,
    currentFacility,
    registerPatient,
    bookAppointment,
    openPatient,
    updatePatientDemographics,
    notify,
  } = useAppState();

  const targetFacilityId = defaultFacilityId || currentFacility.id;
  const targetFacility =
    state.facilities.find((f) => f.id === targetFacilityId) || currentFacility;
  const currentActor =
    state.staff.find((s) => s.id === state.currentUserId)?.name || state.currentRole;

  const facilityProviders = useMemo(
    () =>
      state.staff.filter(
        (s) =>
          s.facilityId === targetFacilityId &&
          (s.role === 'Clinician' || s.role === 'Nurse Practitioner')
      ),
    [state.staff, targetFacilityId]
  );

  // Step 1: Scheduled appointment lookup
  const [lookupQuery, setLookupQuery] = useState('');
  const [selectedExistingPatientId, setSelectedExistingPatientId] = useState<string | null>(null);

  // Step 2: Demographics & scheduled visit details
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<'Female' | 'Male' | 'Other'>('Male');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState(
    targetFacility.region === 'IN' ? 'English / Kannada' : 'English'
  );
  const [abhaId, setAbhaId] = useState('');
  const [chiefConcern, setChiefConcern] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('10:30');
  const [providerId, setProviderId] = useState(
    facilityProviders[0]?.id || state.staff[0]?.id || 'staff-1'
  );
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('Spouse');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // AI-assisted preparation & verification tracking
  const [aiPreparedFields, setAiPreparedFields] = useState<string[]>([]);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [verifiedConflictNotice, setVerifiedConflictNotice] = useState<
    { field: string; existing: string; proposed: string }[]
  >([]);
  const [humanVerified, setHumanVerified] = useState(false);
  const [formError, setFormError] = useState('');

  // Live lookup & duplicate safety checks
  const duplicateMatches = useMemo(() => {
    const searchName = fullName.trim() || lookupQuery.trim();
    if (!searchName && !phone.trim() && !dob.trim() && !abhaId.trim()) return [];
    return evaluateDuplicateSafety(state.patients, {
      fullName: searchName,
      dob: dob.trim(),
      phone: phone.trim(),
      email: email.trim(),
      mrn: lookupQuery.trim().toUpperCase().startsWith('MRN') ? lookupQuery.trim() : undefined,
      abhaId: abhaId.trim(),
    });
  }, [abhaId, dob, email, fullName, lookupQuery, phone, state.patients]);

  const directLookupResults = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return state.patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.dob.includes(q) ||
        (p.abhaId && p.abhaId.toLowerCase().includes(q))
    );
  }, [lookupQuery, state.patients]);

  const completeness = useMemo(
    () =>
      computeRegistrationCompleteness({
        fullName,
        dob,
        sex,
        phone,
        address,
        chiefConcern,
        email,
        emergencyContactName,
        abhaId,
        verifiedByHuman: humanVerified,
      }),
    [abhaId, address, chiefConcern, dob, email, emergencyContactName, fullName, humanVerified, phone, sex]
  );

  const selectedExistingPatient = useMemo(
    () => state.patients.find((p) => p.id === selectedExistingPatientId) || null,
    [selectedExistingPatientId, state.patients]
  );

  const handleLoadExistingVerifiedFields = (patient: Patient) => {
    setSelectedExistingPatientId(patient.id);
    setFullName(patient.fullName);
    setDob(patient.dob);
    setSex(patient.sex);
    setPhone(patient.phone);
    setEmail(patient.email);
    setAddress(patient.address);
    setPreferredLanguage(patient.preferredLanguage);
    setAbhaId(patient.abhaId || '');
    setChiefConcern(patient.chiefConcern || 'Scheduled outpatient follow-up');
    if (patient.caregivers[0]) {
      setEmergencyContactName(patient.caregivers[0].name);
      setEmergencyContactRelation(patient.caregivers[0].relationship);
      setEmergencyContactPhone(patient.caregivers[0].phone);
    }
    setVerifiedConflictNotice([]);
    notify('info', `Loaded verified demographics for ${patient.fullName} (${patient.mrn}) without re-entry.`);
  };

  const handleAiPrepareFromBooking = () => {
    const proposed: Record<string, string> = {
      fullName: fullName.trim() || DEMO_PREFILL_PRESET.fullName,
      dob: dob.trim() || DEMO_PREFILL_PRESET.dob,
      phone: phone.trim() || DEMO_PREFILL_PRESET.phone,
      email: email.trim() || DEMO_PREFILL_PRESET.email,
      address: address.trim() || DEMO_PREFILL_PRESET.address,
      chiefConcern: chiefConcern.trim() || DEMO_PREFILL_PRESET.chiefConcern,
      emergencyContactName:
        emergencyContactName.trim() || DEMO_PREFILL_PRESET.emergencyContactName,
    };

    if (selectedExistingPatient) {
      // Protect previously verified fields from silent overwrite!
      const mergeResult = mergeVerifiedPatientFields(
        {
          fullName: selectedExistingPatient.fullName,
          dob: selectedExistingPatient.dob,
          phone: selectedExistingPatient.phone,
          email: selectedExistingPatient.email,
          address: selectedExistingPatient.address,
        },
        selectedExistingPatient.fieldProvenance,
        proposed,
        'AI-Prepared Booking Intake (Simulated Fixture)'
      );
      if (mergeResult.conflicts.length > 0) {
        setVerifiedConflictNotice(
          mergeResult.conflicts.map((c) => ({
            field: c.field,
            existing: c.existingVerifiedValue,
            proposed: c.proposedDocumentValue,
          }))
        );
      }
      if (!chiefConcern.trim()) setChiefConcern(DEMO_PREFILL_PRESET.chiefConcern);
      setAiPreparedFields(mergeResult.appliedNewFields);
      notify('info', 'Verified demographics preserved; only empty booking fields prepared for review.');
      return;
    }

    const newlyPrepared: string[] = [];
    if (!fullName.trim()) {
      setFullName(DEMO_PREFILL_PRESET.fullName);
      newlyPrepared.push('Full Name');
    }
    if (!dob.trim()) {
      setDob(DEMO_PREFILL_PRESET.dob);
      newlyPrepared.push('Date of Birth');
    }
    if (!phone.trim()) {
      setPhone(DEMO_PREFILL_PRESET.phone);
      newlyPrepared.push('Mobile Number');
    }
    if (!email.trim()) {
      setEmail(DEMO_PREFILL_PRESET.email);
      newlyPrepared.push('Email');
    }
    if (!address.trim()) {
      setAddress(DEMO_PREFILL_PRESET.address);
      newlyPrepared.push('Address');
    }
    if (!chiefConcern.trim()) {
      setChiefConcern(DEMO_PREFILL_PRESET.chiefConcern);
      newlyPrepared.push('Visit Reason');
    }
    if (!emergencyContactName.trim()) {
      setEmergencyContactName(DEMO_PREFILL_PRESET.emergencyContactName);
      setEmergencyContactRelation(DEMO_PREFILL_PRESET.emergencyContactRelation);
      setEmergencyContactPhone(DEMO_PREFILL_PRESET.emergencyContactPhone);
      newlyPrepared.push('Emergency Contact');
    }
    setSex('Male');
    setPreferredLanguage(DEMO_PREFILL_PRESET.preferredLanguage);
    setAiPreparedFields(newlyPrepared);
    setUncertainFields(['Emergency Contact Phone (confirm with patient at desk)']);
    notify(
      'info',
      'Simulated AI fixture prepared draft booking fields — human verification required before saving.'
    );
  };

  const resetForm = () => {
    setLookupQuery('');
    setSelectedExistingPatientId(null);
    setFullName('');
    setDob('');
    setSex('Male');
    setPhone('');
    setEmail('');
    setAddress('');
    setAbhaId('');
    setChiefConcern('');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setAiPreparedFields([]);
    setUncertainFields([]);
    setVerifiedConflictNotice([]);
    setHumanVerified(false);
    setFormError('');
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (facilityProviders[0]?.id) {
      setProviderId(facilityProviders[0].id);
    }
  }, [facilityProviders]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!completeness.readyForRegistration) {
      setFormError(`Complete required fields first: ${completeness.missingRequired.join(', ')}.`);
      return;
    }
    if (!humanVerified) {
      setFormError('Confirm front-desk human verification before completing scheduled registration.');
      return;
    }

    const nowStamp = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${targetFacility.tzAbbr}`;
    const provenance: Record<string, FieldProvenanceEntry> = {
      fullName: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: currentActor,
      },
      dob: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: currentActor,
      },
      phone: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: currentActor,
      },
      address: {
        status: aiPreparedFields.includes('Address') ? 'AI-Extracted' : 'Verified',
        source: aiPreparedFields.includes('Address')
          ? 'AI-Prepared Booking Packet (Simulated Fixture · Staff Reviewed)'
          : 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: currentActor,
      },
      chiefConcern: {
        status: 'Patient-Reported',
        source: 'Scheduled Appointment Context',
        updatedAt: nowStamp,
        verifiedBy: currentActor,
      },
    };

    if (selectedExistingPatient) {
      updatePatientDemographics(selectedExistingPatient.id, {
        chiefConcern: chiefConcern.trim(),
        abhaId: abhaId.trim() || selectedExistingPatient.abhaId,
        registrationStatus: 'Verified & Ready',
        registrationVerifiedBy: currentActor,
        registrationVerifiedAt: nowStamp,
        fieldProvenance: { ...(selectedExistingPatient.fieldProvenance || {}), ...provenance },
      });
      bookAppointment({
        patientId: selectedExistingPatient.id,
        providerId,
        facilityId: targetFacilityId,
        date: TODAY_DATE,
        startTime: appointmentTime,
        durationMin: 30,
        type: 'Scheduled Outpatient Consultation',
        subtype: 'Scheduled Visit',
        status: 'Pre-Registered',
        reason: chiefConcern.trim(),
        reminderSent: false,
        reminderStatus: 'Not Sent',
        calendarSynced: true,
        coPayAmount: targetFacility.currency === 'INR' ? 800 : 25,
        coPayCollected: false,
      });
      onRegistered?.(selectedExistingPatient);
      openPatient(selectedExistingPatient.id, 'overview');
      resetForm();
      onClose();
      return;
    }

    const birthYear = Number(dob.slice(0, 4));
    const computedAge = Number.isFinite(birthYear) ? Math.max(0, 2026 - birthYear) : 45;

    const result = registerPatient({
      fullName: fullName.trim(),
      dob: dob.trim(),
      age: computedAge,
      sex,
      phone: phone.trim(),
      email: email.trim() || 'patient.demo@example.in',
      address: address.trim(),
      abhaId: abhaId.trim() || undefined,
      facilityId: targetFacilityId,
      primaryProviderId: providerId,
      status: 'Active',
      preferredLanguage,
      entryPath: 'Scheduled',
      specialtyTags: ['Preventive Medicine', 'Scheduled Registration'],
      allergies: [],
      conditions: [],
      historyItems: [],
      caregivers: emergencyContactName.trim()
        ? [
            {
              id: `cg-${Date.now()}`,
              name: emergencyContactName.trim(),
              relationship: emergencyContactRelation || 'Family',
              phone: emergencyContactPhone.trim() || phone.trim(),
              isEmergencyContact: true,
              isGuarantor: false,
              portalAccess: 'None',
            },
          ]
        : [],
      careTeamIds: [providerId, state.currentUserId],
      intakeFormsComplete: true,
      photoConsent: false,
      researchConsent: 'Not Asked',
      chiefConcern: chiefConcern.trim(),
      registrationStatus: 'Verified & Ready',
      registrationVerifiedBy: currentActor,
      registrationVerifiedAt: nowStamp,
      fieldProvenance: provenance,
    });

    if (!result.ok || !result.patient) {
      setFormError(result.error || 'Could not complete scheduled registration.');
      return;
    }

    bookAppointment({
      patientId: result.patient.id,
      providerId,
      facilityId: targetFacilityId,
      date: TODAY_DATE,
      startTime: appointmentTime,
      durationMin: 30,
      type: 'Scheduled Outpatient Consultation',
      subtype: 'Scheduled Visit',
      status: 'Pre-Registered',
      reason: chiefConcern.trim(),
      reminderSent: false,
      reminderStatus: 'Not Sent',
      calendarSynced: true,
      coPayAmount: targetFacility.currency === 'INR' ? 800 : 25,
      coPayCollected: false,
    });

    onRegistered?.(result.patient);
    openPatient(result.patient.id, 'overview');
    resetForm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Intelligent Scheduled Patient Registration"
      subtitle={`${targetFacility.name} · Scheduled visits only · Identity safety, duplicate prevention & AI-assisted field preparation (Synthetic Data)`}
      maxWidth="max-w-3xl"
    >
      <form
        onSubmit={handleSubmit}
        data-demo-target="intelligent-registration-modal"
        className="space-y-4 text-xs"
      >
        {/* Top Scope & India-first Privacy Banner */}
        <div className="bg-[#E6F1FB]/60 border border-[#85B7EB] rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 max-w-2xl">
            <Info className="w-4 h-4 text-[#185FA5] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#042C53] leading-relaxed">
              <strong>Scheduled Visit Registration Scope:</strong> Focuses on clean identity verification, duplicate protection, and pre-visit profile readiness. Walk-in and emergency triage remain separate workflows. <strong>ABHA is optional and Aadhaar is never requested.</strong>
            </div>
          </div>
          <button
            type="button"
            data-demo-target="reg-ai-prepare-btn"
            onClick={handleAiPrepareFromBooking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F6E50] hover:bg-[#042C53] text-white font-medium rounded-md transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI-Prepare from Booking Packet (Simulated)
          </button>
        </div>

        {/* Step 1: Live Lookup & Duplicate Safety Check */}
        <section className="bg-[#F7F7F5] border border-slate-200 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="reg-lookup-input"
              className="text-xs font-semibold text-[#042C53] flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-[#185FA5]" />
              Step 1 · Existing Patient Lookup & Duplicate Safety Check
            </label>
            <span className="text-[11px] text-[#5F5D56]">
              Name-only matches are NEVER auto-merged
            </span>
          </div>

          <input
            id="reg-lookup-input"
            data-demo-target="reg-lookup-input"
            type="text"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Search by full name (e.g. Aarav Mehta), MRN, phone, DOB, or optional ABHA..."
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-[#042C53]"
          />

          {/* Duplicate Safety Warnings */}
          {(duplicateMatches.length > 0 || directLookupResults.length > 0) && (
            <div
              data-demo-target="reg-duplicate-panel"
              className="space-y-2 pt-1"
            >
              {duplicateMatches.map((match) => {
                const blockedMerge = !match.mergeAllowed;
                return (
                  <div
                    key={match.patient.id}
                    className={`p-3 rounded-md border flex flex-wrap items-start justify-between gap-3 ${
                      blockedMerge
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-red-50 border-red-300'
                    }`}
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        {blockedMerge ? (
                          <ShieldAlert className="w-4 h-4 text-[#9A5B10] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#B4321F] shrink-0" />
                        )}
                        <span className="font-semibold text-[#042C53]">
                          {match.patient.fullName} ({match.patient.mrn})
                        </span>
                        <StatusBadge
                          label={match.tier}
                          tone={blockedMerge ? 'warning' : 'danger'}
                        />
                      </div>
                      <div className="text-[11px] font-mono text-[#5F5D56]">
                        Existing Chart: DOB {match.patient.dob} · Phone {match.patient.phone} ·{' '}
                        {state.facilities.find((f) => f.id === match.patient.facilityId)?.shortName}
                      </div>
                      <div className="text-[11px] text-[#444441] leading-snug">
                        <strong>Safety Rule:</strong> {match.safetyExplanation}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {match.mergeAllowed ? (
                        <button
                          type="button"
                          onClick={() => handleLoadExistingVerifiedFields(match.patient)}
                          className="px-2.5 py-1.5 bg-[#042C53] text-white text-[11px] font-medium rounded hover:bg-[#185FA5]"
                        >
                          Reuse Existing Chart (No Re-entry)
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 bg-white border border-amber-300 text-[#9A5B10] text-[11px] font-semibold rounded">
                          Merge Blocked · Name-Only Match
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openPatient(match.patient.id, 'overview');
                        }}
                        className="text-[11px] text-[#185FA5] hover:underline"
                      >
                        Inspect {match.patient.mrn}
                      </button>
                    </div>
                  </div>
                );
              })}

              {duplicateMatches.length === 0 && directLookupResults.length > 0 && (
                <div className="p-2.5 bg-white border border-slate-200 rounded-md space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#042C53]">
                    Directory Lookup Matches ({directLookupResults.length})
                  </div>
                  {directLookupResults.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1 border-t border-slate-100 first:border-t-0"
                    >
                      <div>
                        <span className="font-medium text-[#042C53]">{p.fullName}</span>{' '}
                        <span className="font-mono text-[11px] text-[#5F5D56]">
                          ({p.mrn} · DOB {p.dob} · {p.phone})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadExistingVerifiedFields(p)}
                        className="px-2 py-1 text-[11px] font-medium text-[#185FA5] bg-[#E6F1FB] rounded hover:bg-[#85B7EB]/40"
                      >
                        Reuse Verified Record
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Completeness Indicator */}
        <section
          data-demo-target="reg-completeness-meter"
          className="bg-white border border-slate-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-[#185FA5]" />
              <span className="font-semibold text-[#042C53]">
                Registration Completeness: {completeness.percentage}%
              </span>
              <StatusBadge
                label={
                  completeness.readyForRegistration
                    ? `Required ${completeness.requiredCompleted}/${completeness.requiredTotal} Ready`
                    : `${completeness.missingRequired.length} Required Missing`
                }
                tone={completeness.readyForRegistration ? 'success' : 'warning'}
              />
            </div>
            {aiPreparedFields.length > 0 && (
              <span className="text-[11px] text-[#0F6E50] font-medium">
                Simulated AI Draft Fields: {aiPreparedFields.length} (Verify before saving)
              </span>
            )}
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                completeness.readyForRegistration ? 'bg-[#1D9E75]' : 'bg-[#185FA5]'
              }`}
              style={{ width: `${completeness.percentage}%` }}
            />
          </div>

          {completeness.missingRequired.length > 0 && (
            <div className="text-[11px] text-[#9A5B10]">
              Missing required fields: {completeness.missingRequired.join(' · ')}
            </div>
          )}

          {uncertainFields.length > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-[#9A5B10] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>AI Uncertainty Highlight:</strong> {uncertainFields.join('; ')}
              </span>
            </div>
          )}

          {verifiedConflictNotice.length > 0 && (
            <div className="p-2 bg-[#E6F1FB] border border-[#85B7EB] rounded text-[11px] text-[#042C53]">
              <strong>Verified Field Protection Active:</strong> Existing verified values were preserved and NOT overwritten ({verifiedConflictNotice.map((c) => `${c.field}: kept "${c.existing}"`).join('; ')}).
            </div>
          )}
        </section>

        {/* Step 2: Demographics & Scheduled Visit Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="reg-full-name" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Full Legal Name *
            </label>
            <input
              id="reg-full-name"
              data-demo-target="reg-full-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aarav Mehta"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="reg-dob" className="block text-[11px] font-medium text-[#042C53] mb-1">
                Date of Birth *
              </label>
              <input
                id="reg-dob"
                data-demo-target="reg-dob"
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono"
              />
            </div>
            <div>
              <label htmlFor="reg-sex" className="block text-[11px] font-medium text-[#042C53] mb-1">
                Sex *
              </label>
              <select
                id="reg-sex"
                data-demo-target="reg-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as 'Female' | 'Male' | 'Other')}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reg-phone" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Mobile / Phone Number *
            </label>
            <input
              id="reg-phone"
              data-demo-target="reg-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={targetFacility.region === 'IN' ? '+91 98452 33109' : '(555) 234-5678'}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div>
            <label htmlFor="reg-abha" className="block text-[11px] font-medium text-[#042C53] mb-1">
              ABHA ID <span className="text-[#5F5D56] font-normal">(Optional — Never Required; No Aadhaar)</span>
            </label>
            <input
              id="reg-abha"
              data-demo-target="reg-abha"
              type="text"
              value={abhaId}
              onChange={(e) => setAbhaId(e.target.value)}
              placeholder="Optional e.g. 91-4421-8890-1204 (leave blank if unavailable)"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="reg-address" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Residential Address / City *
            </label>
            <input
              id="reg-address"
              data-demo-target="reg-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, neighbourhood, city, postal code"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="reg-visit-reason" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Scheduled Visit Reason & Pre-Visit Context *
            </label>
            <input
              id="reg-visit-reason"
              data-demo-target="reg-visit-reason"
              type="text"
              required
              value={chiefConcern}
              onChange={(e) => setChiefConcern(e.target.value)}
              placeholder="e.g. Scheduled diabetes & metabolic review (patient brought outside lab PDFs)"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="reg-provider" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Scheduled Clinician & Slot ({TODAY_DATE})
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                id="reg-provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                {state.staff
                  .filter((s) => s.role === 'Clinician' || s.role === 'Nurse Practitioner')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.specialty || s.role})
                    </option>
                  ))}
              </select>
              <input
                type="time"
                aria-label="Scheduled slot time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="px-2 py-1.5 border border-slate-300 rounded-md font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-emergency-contact" className="block text-[11px] font-medium text-[#042C53] mb-1">
              Emergency Contact (Recommended)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="reg-emergency-contact"
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Contact name"
                className="px-2.5 py-1.5 border border-slate-300 rounded-md"
              />
              <input
                type="tel"
                aria-label="Emergency contact phone"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder="Contact phone"
                className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Verifier Attribution Gate */}
        <div className="bg-[#F7F7F5] border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-start gap-2 cursor-pointer text-[#042C53]">
            <input
              type="checkbox"
              data-demo-target="reg-verify-checkbox"
              checked={humanVerified}
              onChange={(e) => setHumanVerified(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[11px] leading-snug">
              <strong>Human Verification Attestation ({currentActor} · {state.currentRole}):</strong>{' '}
              I confirm patient identity (Name + DOB + Mobile) has been verified, no name-only duplicate merge was performed, and AI-prepared fields were reviewed.
            </span>
          </label>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#0F6E50] font-medium shrink-0">
            <UserCheck className="w-3.5 h-3.5" />
            Audited on save
          </span>
        </div>

        {formError && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-[#B4321F] rounded-md text-xs flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <span className="text-[11px] text-[#5F5D56] inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0F6E50]" />
            Stops cleanly at Registration Completed → Opens Patient 360° Profile
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-[#042C53] hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-demo-target="reg-submit-btn"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#042C53] hover:bg-[#185FA5] text-white font-semibold rounded-md transition-colors"
            >
              {selectedExistingPatient ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Scheduled Registration
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  Complete Scheduled Registration
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
