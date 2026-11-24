import type { DemoLearningMode, DemoSceneDefinition } from '../demoTypes';

/**
 * Bump SCRIPT_VERSION whenever narration copy or pronunciation rules change
 * so cached audio clips automatically refresh.
 */
export const NARRATION_SCRIPT_VERSION = 'v2.3-audited-clinical-trainer';

export interface PronunciationRule {
  pattern: RegExp;
  spoken: string;
  note: string;
}

/**
 * Authoritative clinical & EHR pronunciation glossary.
 * Applied ONLY when generating spoken speech so visible captions preserve exact clinical notation
 * (e.g., "FHIR R4", "BP 146/88 mmHg", "SpO2 99%", "eGFR 48", "HbA1c 7.4%", "ICD-10", "LOINC")
 * while the narrator speaks them naturally.
 */
export const EHR_PRONUNCIATION_GLOSSARY: readonly PronunciationRule[] = [
  { pattern: /\bFHIR\s+R4\b/g, spoken: 'Fire R 4', note: 'HL7 FHIR standard pronunciation' },
  { pattern: /\bHL7\s+FHIR\b/g, spoken: 'H L 7 Fire', note: 'HL7 FHIR standard' },
  { pattern: /\bFHIR\b/g, spoken: 'Fire', note: 'FHIR standard' },
  { pattern: /\bICD-10-CM\b/g, spoken: 'I C D 10 C M', note: 'US CDC/NCHS ICD-10-CM pronunciation' },
  { pattern: /\bICD-10\b/g, spoken: 'I C D 10', note: 'WHO ICD-10 pronunciation' },
  { pattern: /\bICD-11\b/g, spoken: 'I C D 11', note: 'WHO ICD-11 pronunciation' },
  { pattern: /\bLOINC\b/g, spoken: 'Loink', note: 'Regenstrief LOINC pronunciation' },
  { pattern: /\bKDIGO\b/g, spoken: 'K D I G O', note: 'Kidney Disease Improving Global Outcomes' },
  { pattern: /\bRSSDI\b/g, spoken: 'R S S D I', note: 'Research Society for the Study of Diabetes in India' },
  { pattern: /\bABDM\b/g, spoken: 'A B D M', note: 'Ayushman Bharat Digital Mission' },
  { pattern: /\bABHA\b/g, spoken: 'A B H A', note: 'Ayushman Bharat Health Account' },
  { pattern: /\bHbA1c\b/gi, spoken: 'hemoglobin A 1 C', note: 'Glycated hemoglobin lab assay' },
  { pattern: /\bNKDA\b/g, spoken: 'no known drug allergies', note: 'Expand NKDA' },
  { pattern: /\bDOB\b/g, spoken: 'date of birth', note: 'Expand DOB' },
  { pattern: /\bPDFs\b/g, spoken: 'P D Fs', note: 'Plural PDF pronunciation' },
  { pattern: /\bPDF\b/g, spoken: 'P D F', note: 'PDF pronunciation' },
  { pattern: /\bLIS\b/g, spoken: 'L I S', note: 'Laboratory Information System' },
  { pattern: /\b360°/g, spoken: '360', note: 'Pronounce Patient 360 cleanly' },
  { pattern: /\bMRN-(\d+)\b/g, spoken: 'medical record number $1', note: 'Expand MRN prefix' },
  { pattern: /\bREQ-(\d+)\b/g, spoken: 'requisition $1', note: 'Expand lab requisition ID' },
  { pattern: /\b(\d{2,3})\/(\d{2,3})\s*mmHg\b/gi, spoken: '$1 over $2 millimeters of mercury', note: 'Blood pressure with unit' },
  { pattern: /\b(\d{2,3})\/(\d{2,3})\b/g, spoken: '$1 over $2', note: 'Blood pressure reading' },
  { pattern: /\bmmHg\b/gi, spoken: 'millimeters of mercury', note: 'Blood pressure unit' },
  { pattern: /\bSpO2\b/gi, spoken: 'oxygen saturation', note: 'Pulse oximetry' },
  { pattern: /\beGFR\b/g, spoken: 'estimated G F R', note: 'Kidney filtration rate' },
  { pattern: /\bCKD\b/g, spoken: 'chronic kidney disease', note: 'Expand CKD' },
  { pattern: /\bHTN\b/g, spoken: 'hypertension', note: 'Expand HTN' },
  { pattern: /\bK\+\b/g, spoken: 'potassium', note: 'Serum potassium' },
  { pattern: /\bmmol\/L\b/gi, spoken: 'millimoles per liter', note: 'Lab concentration unit' },
  { pattern: /\bmg\/dL\b/gi, spoken: 'milligrams per deciliter', note: 'Lab concentration unit' },
  { pattern: /\bmL\/min(?:\/1\.73m2)?\b/gi, spoken: 'milliliters per minute', note: 'eGFR unit' },
  { pattern: /\bbpm\b/gi, spoken: 'beats per minute', note: 'Heart rate unit' },
  { pattern: /\bAVS\b/g, spoken: 'After-Visit Summary', note: 'Expand AVS' },
  { pattern: /\bEHR\b/g, spoken: 'E H R', note: 'Clear letter pronunciation' },
  { pattern: /\bCMA\b/g, spoken: 'Certified Medical Assistant', note: 'Expand CMA credential' },
  { pattern: /\bMLS\b/g, spoken: 'Medical Laboratory Scientist', note: 'Expand MLS credential' },
  { pattern: /\bNP\b/g, spoken: 'Nurse Practitioner', note: 'Expand NP credential' },
  { pattern: /\bRN\b/g, spoken: 'Registered Nurse', note: 'Expand RN credential' },
  { pattern: /\bMD\b/g, spoken: 'M D', note: 'Clear MD credential' },
  { pattern: /\bBP\b/g, spoken: 'blood pressure', note: 'Expand BP' },
  { pattern: /\bHR\b/g, spoken: 'heart rate', note: 'Expand HR' },
  { pattern: /\bEST\b/g, spoken: 'Eastern time', note: 'Timezone label' },
  { pattern: /\bIST\b/g, spoken: 'India Standard Time', note: 'Timezone label' },
  { pattern: /\bPII\b/g, spoken: 'personal identifying information', note: 'Privacy term' },
  { pattern: /\beRx\b/g, spoken: 'electronic prescribing', note: 'Expand eRx' },
  { pattern: /\s*—\s*/g, spoken: ', ', note: 'Convert em-dash to natural brief pause' },
  { pattern: /\s*·\s*/g, spoken: ', ', note: 'Convert middle dot separator to natural pause' },
];

/**
 * Single authoritative transcript per scene so visible captions and spoken audio
 * always contain the same words.
 * In Executive Demo mode, uses a concise script when provided instead of speeding up audio unnaturally.
 */
export function getAuthoritativeCaption(
  scene: Pick<DemoSceneDefinition, 'narration' | 'caption' | 'executiveNarration'>,
  learningMode: DemoLearningMode = 'watch'
): string {
  if (learningMode === 'executive' && scene.executiveNarration?.trim()) {
    return ensureSentencePunctuation(scene.executiveNarration.trim());
  }
  const source = (scene.narration || scene.caption || '').trim();
  return ensureSentencePunctuation(source);
}

/**
 * Guarantees complete sentence termination punctuation so TTS prosody finishes naturally
 * with a falling intonation rather than cutting off abruptly.
 */
export function ensureSentencePunctuation(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/[.!?]$/.test(cleaned)) return cleaned;
  return `${cleaned}.`;
}

/**
 * Applies the EHR pronunciation glossary to an authoritative caption for TTS synthesis.
 * Never splits mid-word or drops the final word.
 */
export function prepareSpokenText(authoritativeCaption: string): string {
  let spoken = ensureSentencePunctuation(authoritativeCaption);
  for (const rule of EHR_PRONUNCIATION_GLOSSARY) {
    spoken = spoken.replace(rule.pattern, rule.spoken);
  }
  return spoken.replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();
}

/**
 * Splits a paragraph strictly on complete sentence boundaries (never mid-word or mid-clause).
 * Used by browser TTS fallback to prevent Chrome's ~15-second long-utterance cutoff bug
 * while preserving natural sentence intonation.
 */
export function splitIntoCompleteSentences(text: string): string[] {
  const normalized = ensureSentencePunctuation(text);
  if (!normalized) return [];

  // Protect common clinical abbreviations (Dr., Mr., Mrs., Ms., St., vs.) from false splits
  const protectedText = normalized
    .replace(/\b(Dr|Mr|Mrs|Ms|St|vs|approx)\./g, '$1\u0000')
    .replace(/(\d)\.(\d)/g, '$1\u0001$2');

  const rawParts = protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u0000/g, '.').replace(/\u0001/g, '.').trim())
    .filter(Boolean);

  return rawParts.length > 0 ? rawParts : [normalized];
}

/**
 * Extracts the final spoken word for diagnostic verification (e.g. "workflow", "Summary", "queues").
 */
export function extractFinalWord(text: string): string {
  const cleaned = text.replace(/[^\w\s'-]/g, ' ').trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] || '';
}

export const VOICE_PREVIEW_SAMPLE_TEXT =
  "Welcome to EigenH. Let's walk through this clinical workflow together, step by step, so every action is clear and verified.";
