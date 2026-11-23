import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { findAvailableSlots, findDuplicatePatients } from '../../state/domainLogic';
import { useAppState } from '../../state/AppStateContext';
import type { AppointmentSubtype, TaskItem } from '../../types/hms';
import { Modal, StatusBadge } from '../ui/Primitives';

export const RegisterPatientModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onRegistered?: (patientId: string) => void;
  defaultEntryPath?: 'Scheduled' | 'Walk-in' | 'Referral' | 'Emergency';
}> = ({ open, onClose, onRegistered, defaultEntryPath = 'Scheduled' }) => {
  const { state, registerPatient, addInsurancePolicy, openPatient } = useAppState();
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<'Female' | 'Male' | 'Other'>('Female');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [entryPath, setEntryPath] = useState<'Scheduled' | 'Walk-in' | 'Referral' | 'Emergency'>(defaultEntryPath);
  const [chiefConcern, setChiefConcern] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecRelation, setEcRelation] = useState('Spouse / Partner');
  const [ecPhone, setEcPhone] = useState('');
  const [allergySubstance, setAllergySubstance] = useState('');
  const [allergyReaction, setAllergyReaction] = useState('');
  const [allergySeverity, setAllergySeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [payerName, setPayerName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEntryPath(defaultEntryPath);
      setError('');
    }
  }, [defaultEntryPath, open]);

  const duplicates = useMemo(
    () => findDuplicatePatients(state.patients, { fullName, dob, phone, email }),
    [dob, email, fullName, phone, state.patients]
  );

  const intakeMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!fullName.trim()) missing.push('Full name');
    if (!dob) missing.push('Date of birth');
    if (!phone.trim()) missing.push('Phone');
    if (!ecName.trim()) missing.push('Emergency contact');
    if (!chiefConcern.trim()) missing.push('Chief concern');
    return missing;
  }, [chiefConcern, dob, ecName, fullName, phone]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !dob) {
      setError('Full name and date of birth are required.');
      return;
    }
    const birthYear = Number(dob.slice(0, 4)) || 1980;
    const age = Math.max(0, 2026 - birthYear);
    const facilityProviders = state.staff.filter(
      (s) => s.facilityId === state.currentFacilityId && s.role === 'Clinician'
    );
    const facilityNurses = state.staff.filter(
      (s) => s.facilityId === state.currentFacilityId && s.role === 'Nurse / Care Coordinator'
    );
    const primaryProviderId = facilityProviders[0]?.id || state.staff[0].id;
    const careTeamIds = Array.from(
      new Set([primaryProviderId, ...(facilityNurses[0] ? [facilityNurses[0].id] : [])])
    );

    const res = registerPatient({
      fullName: fullName.trim(),
      dob,
      age,
      sex,
      phone: phone.trim() || '(617) 555-0101',
      email: email.trim() || `${fullName.trim().toLowerCase().replace(/\s+/g, '.')}@example.org`,
      address: address.trim() || 'Synthetic demo address',
      facilityId: state.currentFacilityId,
      primaryProviderId,
      status: 'Active',
      preferredLanguage: 'English',
      entryPath,
      chiefConcern: chiefConcern.trim() || undefined,
      specialtyTags: [],
      allergies: allergySubstance.trim()
        ? [
            {
              id: `alg-reg-${Date.now()}`,
              substance: allergySubstance.trim(),
              reaction: allergyReaction.trim() || 'Reported reaction',
              severity: allergySeverity,
              verified: true,
              source: 'Walk-in Registration Intake',
              recordedDate: TODAY_DATE,
            },
          ]
        : [],
      conditions: [],
      historyItems: chiefConcern.trim()
        ? [
            {
              id: `hist-reg-${Date.now()}`,
              category: 'Medical',
              title: `Initial Presenting Concern: ${chiefConcern.trim()}`,
              detail: `Recorded during ${entryPath} registration.`,
              date: TODAY_DATE,
              source: 'Front Desk Intake',
              lastReviewed: TODAY_DATE,
              verified: true,
            },
          ]
        : [],
      caregivers: ecName.trim()
        ? [
            {
              id: `cg-${Date.now()}`,
              name: ecName.trim(),
              relationship: ecRelation.trim() || 'Emergency Contact',
              phone: ecPhone.trim() || '(617) 555-0199',
              isEmergencyContact: true,
              isGuarantor: false,
              portalAccess: 'None',
            },
          ]
        : [],
      careTeamIds,
      intakeFormsComplete: false,
      photoConsent: false,
      researchConsent: 'Not Asked',
    });

    if (!res.ok || !res.patient) {
      setError(res.error || 'Could not register patient.');
      return;
    }

    if (payerName.trim()) {
      addInsurancePolicy({
        patientId: res.patient.id,
        payerName: payerName.trim(),
        payerCategory: payerName.toLowerCase().includes('self') ? 'Self-Pay' : 'Commercial',
        planName: payerName.toLowerCase().includes('self') ? 'Self-Pay Discount Plan' : 'Standard PPO Plan',
        memberId: memberId.trim() || `MEM-${Math.floor(100000 + Math.random() * 899999)}`,
        groupNumber: 'GRP-DEMO-01',
        isPrimary: true,
        status: 'Pending Verification',
        eligibilityCheckedAt: 'Not yet checked',
        eligibilitySummary: {
          preventiveServices: '100% covered (simulated)',
          nonCoveredNote: 'Simulated coverage details only',
          deductibleTotal: 1500,
          deductibleMet: 400,
          coinsurancePct: 20,
          copay: 25,
        },
      });
    }

    setFullName('');
    setDob('');
    setPhone('');
    setEmail('');
    setAddress('');
    setChiefConcern('');
    setEcName('');
    setEcPhone('');
    setAllergySubstance('');
    setAllergyReaction('');
    setPayerName('');
    setMemberId('');
    onClose();
    if (onRegistered) {
      onRegistered(res.patient.id);
    } else {
      openPatient(res.patient.id, 'overview');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register Synthetic Patient"
      subtitle="Fictional patient record with live duplicate detection"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="p-2.5 text-xs text-[#B4321F] bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
            <div className="text-xs font-semibold text-[#9A5B10]">
              Possible Duplicate Detected ({duplicates.length})
            </div>
            {duplicates.map((d) => (
              <div key={d.patient.id} className="flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-medium text-[#042C53]">{d.patient.fullName}</span>{' '}
                  <span className="font-mono text-[11px] text-[#5F5D56]">{d.patient.mrn}</span>
                  <div className="text-[11px] text-[#5F5D56]">
                    {d.reasons.join(' · ')} ({d.score}% match)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openPatient(d.patient.id, 'overview');
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-white border border-amber-300 rounded text-[#042C53] hover:bg-amber-100"
                >
                  Open Existing
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-medium text-[#042C53] mb-1">
              Full Name *
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jordan Mercer"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="reg-dob" className="block text-xs font-medium text-[#042C53] mb-1">
              Date of Birth *
            </label>
            <input
              id="reg-dob"
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="reg-sex" className="block text-xs font-medium text-[#042C53] mb-1">
              Sex
            </label>
            <select
              id="reg-sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as 'Female' | 'Male' | 'Other')}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="reg-entry" className="block text-xs font-medium text-[#042C53] mb-1">
              Entry Path
            </label>
            <select
              id="reg-entry"
              value={entryPath}
              onChange={(e) =>
                setEntryPath(e.target.value as 'Scheduled' | 'Walk-in' | 'Referral' | 'Emergency')
              }
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Scheduled">Scheduled</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Referral">Referral</option>
              <option value="Emergency">Emergency</option>
            </select>
          </div>
          <div>
            <label htmlFor="reg-phone" className="block text-xs font-medium text-[#042C53] mb-1">
              Phone
            </label>
            <input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(617) 555-0123"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-xs font-medium text-[#042C53] mb-1">
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.org"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* AI Intake & Duplicate Check Assistant */}
        <div className="p-2.5 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded-md flex items-start gap-2 text-[11px] text-[#042C53]">
          <Sparkles className="w-3.5 h-3.5 text-[#185FA5] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">AI Registration Assistant (Simulated):</span>{' '}
            {duplicates.length > 0
              ? `${duplicates.length} possible existing chart match(es) detected — review before creating a duplicate.`
              : intakeMissingFields.length === 0
              ? 'Zero duplicates detected; registration & intake fields complete.'
              : `No duplicates detected. Recommended intake items still blank: ${intakeMissingFields.join(', ')}.`}
          </div>
        </div>

        <div>
          <label htmlFor="reg-addr" className="block text-xs font-medium text-[#042C53] mb-1">
            Street Address
          </label>
          <input
            id="reg-addr"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, Postal Code"
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="reg-concern" className="block text-xs font-medium text-[#042C53] mb-1">
            Chief Concern / Reason for Walk-In
          </label>
          <input
            id="reg-concern"
            type="text"
            value={chiefConcern}
            onChange={(e) => setChiefConcern(e.target.value)}
            placeholder="e.g. Intermittent dizziness and elevated home blood pressure"
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>

        {/* Emergency Contact */}
        <div className="p-2.5 bg-[#F7F7F5] border border-slate-200 rounded-md space-y-2">
          <div className="text-[11px] font-semibold text-[#042C53]">Emergency Contact</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              aria-label="Emergency contact name"
              type="text"
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
              placeholder="Contact Name"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
            <input
              aria-label="Emergency contact relationship"
              type="text"
              value={ecRelation}
              onChange={(e) => setEcRelation(e.target.value)}
              placeholder="Relationship"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
            <input
              aria-label="Emergency contact phone"
              type="tel"
              value={ecPhone}
              onChange={(e) => setEcPhone(e.target.value)}
              placeholder="Phone"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
          </div>
        </div>

        {/* Known Allergy & Optional Coverage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-2.5 bg-[#F7F7F5] border border-slate-200 rounded-md space-y-1.5">
            <div className="text-[11px] font-semibold text-[#042C53]">Known Allergy (leave blank for NKDA)</div>
            <input
              aria-label="Allergy substance"
              type="text"
              value={allergySubstance}
              onChange={(e) => setAllergySubstance(e.target.value)}
              placeholder="e.g. Penicillin"
              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                aria-label="Allergy reaction"
                type="text"
                value={allergyReaction}
                onChange={(e) => setAllergyReaction(e.target.value)}
                placeholder="Reaction (e.g. Hives)"
                className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
              />
              <select
                aria-label="Allergy severity"
                value={allergySeverity}
                onChange={(e) => setAllergySeverity(e.target.value as 'Mild' | 'Moderate' | 'Severe')}
                className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="Mild">Mild</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
              </select>
            </div>
          </div>

          <div className="p-2.5 bg-[#F7F7F5] border border-slate-200 rounded-md space-y-1.5">
            <div className="text-[11px] font-semibold text-[#042C53]">Coverage / Payer (Optional, Simulated)</div>
            <input
              aria-label="Insurance payer name"
              type="text"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="e.g. BlueCross MA or Self-Pay"
              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
            />
            <input
              aria-label="Insurance member ID"
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Member ID (optional)"
              className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            Register Patient
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const BookAppointmentModal: React.FC<{
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}> = ({ open, onClose, defaultPatientId }) => {
  const { state, currentFacility, bookAppointment } = useAppState();
  const facilityPatients = state.patients.filter((p) => p.facilityId === state.currentFacilityId);
  const providers = state.staff.filter(
    (s) => s.facilityId === state.currentFacilityId && s.role === 'Clinician'
  );

  const [patientId, setPatientId] = useState(
    defaultPatientId || facilityPatients[0]?.id || state.patients[0]?.id || ''
  );
  const [providerId, setProviderId] = useState(providers[0]?.id || state.staff[0]?.id || '');
  const [date, setDate] = useState(TODAY_DATE);
  const [startTime, setStartTime] = useState('11:00');
  const [durationMin, setDurationMin] = useState(30);
  const [type, setType] = useState('Follow-up Visit');
  const [subtype, setSubtype] = useState<AppointmentSubtype>('Scheduled Visit');
  const [room, setRoom] = useState('');
  const [reason, setReason] = useState('');
  const [addToWaitlist, setAddToWaitlist] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const targetPid = defaultPatientId || facilityPatients[0]?.id || state.patients[0]?.id || '';
    if (targetPid) {
      setPatientId(targetPid);
      const targetPat = state.patients.find((p) => p.id === targetPid);
      if (targetPat) {
        if (targetPat.entryPath === 'Walk-in') {
          setSubtype('Walk-in');
          setType('Walk-in Acute');
        }
        if (targetPat.chiefConcern && !reason) {
          setReason(targetPat.chiefConcern);
        }
      }
    }
    if (providers[0]?.id) setProviderId(providers[0].id);
  }, [defaultPatientId, open]);

  const suggestedSlots = useMemo(
    () =>
      findAvailableSlots(state.appointments, {
        facilityId: state.currentFacilityId,
        providerId,
        date,
        durationMin,
        maxSuggestions: 5,
      }),
    [date, durationMin, providerId, state.appointments, state.currentFacilityId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('Visit reason is required.');
      return;
    }
    const res = bookAppointment({
      patientId,
      providerId,
      facilityId: state.currentFacilityId,
      date,
      startTime,
      durationMin,
      type,
      subtype,
      status: addToWaitlist ? 'Waitlist' : 'Scheduled',
      room: room.trim() || undefined,
      reason: reason.trim(),
      reminderSent: false,
      calendarSynced: false,
      coPayAmount: currentFacility.region === 'IN' ? 800 : 25,
      coPayCollected: false,
    });
    if (!res.ok) {
      setError(res.error || 'Could not book appointment.');
      return;
    }
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book Appointment"
      subtitle={`Facility: ${currentFacility.name} (${currentFacility.tzAbbr})`}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="p-2.5 text-xs text-[#B4321F] bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-patient" className="block text-xs font-medium text-[#042C53] mb-1">
              Patient *
            </label>
            <select
              id="bk-patient"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bk-provider" className="block text-xs font-medium text-[#042C53] mb-1">
              Provider *
            </label>
            <select
              id="bk-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.staff
                .filter((s) => s.role === 'Clinician')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="bk-date" className="block text-xs font-medium text-[#042C53] mb-1">
              Date *
            </label>
            <input
              id="bk-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="bk-time" className="block text-xs font-medium text-[#042C53] mb-1">
              Start Time ({currentFacility.tzAbbr}) *
            </label>
            <input
              id="bk-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* AI Suggested Available Slots */}
        <div className="p-2.5 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded-md space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#042C53]">
            <Sparkles className="w-3.5 h-3.5 text-[#185FA5]" />
            AI Suggested Open Slots ({date}, {durationMin} min — conflict-free)
          </div>
          {suggestedSlots.length === 0 ? (
            <div className="text-[11px] text-[#5F5D56]">
              No open slots found on {date}. Choose another date or place on Waitlist.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {suggestedSlots.map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => {
                    setStartTime(slot.startTime);
                    setError('');
                  }}
                  className={`px-2 py-1 text-[11px] font-mono rounded border ${
                    startTime === slot.startTime
                      ? 'bg-[#042C53] text-white border-[#042C53]'
                      : 'bg-white text-[#042C53] border-slate-300 hover:bg-[#E6F1FB]'
                  }`}
                >
                  {slot.startTime}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-type" className="block text-xs font-medium text-[#042C53] mb-1">
              Appointment Type
            </label>
            <select
              id="bk-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Follow-up Visit">Follow-up Visit</option>
              <option value="New Patient Consult">New Patient Consult</option>
              <option value="Telehealth Check-in">Telehealth Check-in</option>
              <option value="Haemodialysis Session">Haemodialysis Session</option>
              <option value="Walk-in Acute">Walk-in Acute</option>
            </select>
          </div>
          <div>
            <label htmlFor="bk-subtype" className="block text-xs font-medium text-[#042C53] mb-1">
              Entry Subtype
            </label>
            <select
              id="bk-subtype"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value as AppointmentSubtype)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Scheduled Visit">Scheduled Visit</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Referral Consult">Referral Consult</option>
              <option value="Telehealth">Telehealth</option>
              <option value="Recurring Dialysis">Recurring Dialysis</option>
              <option value="Group Education">Group Education</option>
            </select>
          </div>
          <div>
            <label htmlFor="bk-dur" className="block text-xs font-medium text-[#042C53] mb-1">
              Duration (min)
            </label>
            <select
              id="bk-dur"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
          <div>
            <label htmlFor="bk-room" className="block text-xs font-medium text-[#042C53] mb-1">
              Resource / Room (optional)
            </label>
            <input
              id="bk-room"
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Exam 2"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bk-reason" className="block text-xs font-medium text-[#042C53] mb-1">
            Reason for Visit *
          </label>
          <input
            id="bk-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Blood pressure follow-up"
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={addToWaitlist}
            onChange={(e) => setAddToWaitlist(e.target.checked)}
          />
          Place on Waitlist instead of confirming slot
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            Confirm Booking
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const CreateTaskModal: React.FC<{
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}> = ({ open, onClose, defaultPatientId }) => {
  const { state, createTask } = useAppState();
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState(state.currentUserId);
  const [priority, setPriority] = useState<TaskItem['priority']>('Medium');
  const [dueDate, setDueDate] = useState(TODAY_DATE);
  const [patientId, setPatientId] = useState(defaultPatientId || '');
  const [team, setTeam] = useState('Internal Medicine');
  const [patientVisible, setPatientVisible] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    createTask({
      title: title.trim(),
      status: 'To Do',
      priority,
      ownerId,
      team,
      facilityId: state.currentFacilityId,
      patientId: patientId || undefined,
      dueDate,
      patientVisible,
      timeLoggedMin: 0,
      subtasks: [],
    });
    setTitle('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Task" subtitle="Add work item to staff and patient queues">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="p-2.5 text-xs text-[#B4321F] bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="tsk-title" className="block text-xs font-medium text-[#042C53] mb-1">
            Task Title *
          </label>
          <input
            id="tsk-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call patient with potassium check plan"
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="tsk-owner" className="block text-xs font-medium text-[#042C53] mb-1">
              Assign Owner
            </label>
            <select
              id="tsk-owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tsk-prio" className="block text-xs font-medium text-[#042C53] mb-1">
              Priority
            </label>
            <select
              id="tsk-prio"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskItem['priority'])}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label htmlFor="tsk-due" className="block text-xs font-medium text-[#042C53] mb-1">
              Due Date
            </label>
            <input
              id="tsk-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="tsk-team" className="block text-xs font-medium text-[#042C53] mb-1">
              Team Worklist
            </label>
            <select
              id="tsk-team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Internal Medicine">Internal Medicine</option>
              <option value="Care Coordination">Care Coordination</option>
              <option value="Front Desk">Front Desk</option>
              <option value="Revenue Cycle">Revenue Cycle</option>
              <option value="Nephrology">Nephrology</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="tsk-pat" className="block text-xs font-medium text-[#042C53] mb-1">
            Linked Patient (optional)
          </label>
          <select
            id="tsk-pat"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="">None (General Operational Task)</option>
            {state.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.mrn})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={patientVisible}
            onChange={(e) => setPatientVisible(e.target.checked)}
          />
          Visible to Patient / Authorised Caregiver
        </label>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            Save Task
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const HelpPreferencesModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { state, createSupportTicket, notify } = useAppState();
  const [tab, setTab] = useState<'help' | 'preferences' | 'support' | 'status'>('help');
  const [helpSearch, setHelpSearch] = useState('');
  const [oooEnabled, setOooEnabled] = useState(false);
  const [delegateId, setDelegateId] = useState(state.staff[1]?.id || '');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketCat, setTicketCat] = useState<'Workflow' | 'Access' | 'Bug' | 'Feedback'>('Workflow');

  const helpArticles = [
    { title: 'Starting & Signing an Encounter (SOAP)', area: 'M07 Encounters', body: 'Drafts save locally. Signing locks the note read-only; corrections use Amendments.' },
    { title: 'AI Agent Individual Action Approval', area: 'D01 Patient AI Agent', body: 'Each proposed order, task, or appointment must be approved or cancelled individually.' },
    { title: 'Location Timezones & India ABDM', area: 'M35 Regional Mode', body: 'Switching to Bengaluru Hub activates IST timestamps, INR currency, and ABDM consent tools.' },
    { title: 'Prototype Data & Reset', area: 'Demo Controls', body: 'All records are fictional synthetic data stored in browser localStorage. Use Reset in the top bar anytime.' },
  ].filter(
    (a) =>
      !helpSearch.trim() ||
      a.title.toLowerCase().includes(helpSearch.toLowerCase()) ||
      a.body.toLowerCase().includes(helpSearch.toLowerCase())
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Help, Support & Personal Settings"
      subtitle="M38 · Prototype documentation, delegation, and local support tickets"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 p-1 bg-[#F1EFE8] rounded-lg">
          {[
            { id: 'help', label: 'Help & Training' },
            { id: 'preferences', label: 'Preferences & OOO' },
            { id: 'support', label: `Support (${state.supportTickets.length})` },
            { id: 'status', label: 'Prototype Status & Notes' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === t.id ? 'bg-white text-[#042C53] shadow-xs' : 'text-[#5F5D56]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'help' && (
          <div className="space-y-3">
            <input
              type="search"
              placeholder="Search help articles & onboarding guides..."
              value={helpSearch}
              onChange={(e) => setHelpSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
              {helpArticles.map((a) => (
                <div key={a.title} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#042C53]">{a.title}</span>
                    <span className="text-[11px] text-[#5F5D56]">{a.area}</span>
                  </div>
                  <p className="text-xs text-[#5F5D56] mt-1">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'preferences' && (
          <div className="space-y-3">
            <div className="p-3 border border-slate-200 rounded-md space-y-2.5">
              <div className="text-xs font-semibold text-[#042C53]">Coverage & Out-of-Office Delegation</div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={oooEnabled}
                  onChange={(e) => setOooEnabled(e.target.checked)}
                />
                Enable Out-of-Office coverage delegation (simulated)
              </label>
              <div>
                <label htmlFor="ooo-del" className="block text-xs text-[#5F5D56] mb-1">
                  Covering Clinician / Coordinator
                </label>
                <select
                  id="ooo-del"
                  value={delegateId}
                  onChange={(e) => setDelegateId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                >
                  {state.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => notify('success', `Coverage preference saved (${oooEnabled ? 'Active' : 'Inactive'})`)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}

        {tab === 'support' && (
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ticketTitle.trim()) return;
                createSupportTicket({
                  title: ticketTitle.trim(),
                  category: ticketCat,
                  description: ticketDesc.trim() || 'Logged from Help modal',
                });
                setTicketTitle('');
                setTicketDesc('');
              }}
              className="p-3 border border-slate-200 rounded-md space-y-2.5"
            >
              <div className="text-xs font-semibold text-[#042C53]">Submit Support Request / Feedback</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Summary title..."
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  className="sm:col-span-2 px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                />
                <select
                  value={ticketCat}
                  onChange={(e) => setTicketCat(e.target.value as typeof ticketCat)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="Workflow">Workflow</option>
                  <option value="Feedback">Feedback</option>
                  <option value="Access">Access</option>
                  <option value="Bug">Bug</option>
                </select>
              </div>
              <textarea
                rows={2}
                placeholder="Details..."
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
              >
                Submit Local Ticket
              </button>
            </form>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
              {state.supportTickets.map((t) => (
                <div key={t.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-medium text-[#042C53]">{t.title}</div>
                    <div className="text-[11px] text-[#5F5D56]">
                      {t.category} · {t.createdAt}
                    </div>
                  </div>
                  <StatusBadge label={t.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'status' && (
          <div className="space-y-2 text-xs text-slate-700">
            <div className="p-3 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded-md">
              <div className="font-semibold text-[#042C53]">Prototype Boundary Disclosure</div>
              <p className="mt-1 text-[#5F5D56]">
                All patients, labs, prescriptions, claims, eligibility checks, faxes, and AI outputs are fictional synthetic simulations. No Medplum FHIR server, clearinghouse, e-prescribing network, or ABDM gateway is connected.
              </p>
            </div>
            <div className="p-3 border border-slate-200 rounded-md">
              <div className="font-semibold text-[#042C53]">Release Notes — Prototype v1.0</div>
              <ul className="list-disc pl-4 mt-1 space-y-1 text-[#5F5D56]">
                <li>Global Staff Portal (M01–M38), Persistent Patient Workspace, and Patient & Caregiver Portal (M22).</li>
                <li>Detailed screens D01–D06 implemented with connected local persistence.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
