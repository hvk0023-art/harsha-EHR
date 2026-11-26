import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express, { type Router } from 'express';
import {
  isSupportedOperation,
  validateActionComposerOutput,
  validateAmbientScribeV2Output,
  validateChartNarrativeOutput,
  validateDocumentIntelligenceOutput,
  validatePreConsultationBriefOutput,
} from '../src/ai/aiOutputValidator.ts';
import {
  CLINICAL_AI_PROMPT_VERSION,
  CLINICAL_AI_SAFETY_BOUNDARIES,
  CLINICAL_AI_SCHEMA_VERSION,
  type ClinicalAIModelAttempt,
  type ClinicalAIOperation,
  type ClinicalAIResponse,
} from '../src/ai/clinicalAiTypes.ts';

export const CLINICAL_AI_TEXT_MODEL = 'gemini-4-hydrogen';
export const CLINICAL_AI_FALLBACK_MODEL = 'gemini-3.6-flash';
export const CLINICAL_AI_FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
] as const;
const CLINICAL_AI_TIMEOUT_MS = 25000;
const MAX_PROMPT_CHARS = 32000;
const MAX_PRIMARY_ATTEMPTS = 2;
const MAX_FALLBACK_ATTEMPTS = 1;
const BACKOFF_BASE_MS = 500;
const MAX_BACKOFF_MS = 4000;
const MODEL_TRANSIENT_COOLDOWN_MS = 60000;

const modelTransientCooldownUntil = new Map<string, number>();

export function orderModelsWithCooldown(
  models: readonly string[],
  cooldownMap: ReadonlyMap<string, number>,
  nowMs = Date.now()
): string[] {
  const healthy: string[] = [];
  const cooling: string[] = [];
  for (const m of models) {
    const until = cooldownMap.get(m) ?? 0;
    if (until > nowMs) {
      cooling.push(m);
    } else {
      healthy.push(m);
    }
  }
  return [...healthy, ...cooling];
}

export type GeminiErrorCategory =
  | 'auth'
  | 'unsupported_model'
  | 'bad_request'
  | 'rate_limit'
  | 'capacity_transient'
  | 'timeout'
  | 'unknown';

export interface ClassifiedGeminiError {
  category: GeminiErrorCategory;
  httpStatus: number;
  errorCode: NonNullable<ClinicalAIResponse['error']>['code'];
  retryable: boolean;
  failoverAllowed: boolean;
  retryDelayMs?: number;
  formattedMessage: string;
}

export function parseProviderRetryDelayMs(raw: string): number | undefined {
  // Check JSON details[].retryDelay e.g. "2s", "1.5s", "1500ms"
  const jsonDelayMatch = raw.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)(ms|s)"/i);
  if (jsonDelayMatch) {
    const num = Number(jsonDelayMatch[1]);
    const unit = jsonDelayMatch[2].toLowerCase();
    if (Number.isFinite(num) && num > 0) {
      return Math.min(MAX_BACKOFF_MS, Math.round(unit === 's' ? num * 1000 : num));
    }
  }
  // Check prose "retry in 3.2s" or "Retry-After: 4"
  const proseMatch = raw.match(/(?:retry\s+(?:in|after)\s*[:=]?\s*)(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)?/i);
  if (proseMatch) {
    const num = Number(proseMatch[1]);
    const unit = (proseMatch[2] || 's').toLowerCase();
    if (Number.isFinite(num) && num > 0) {
      return Math.min(MAX_BACKOFF_MS, Math.round(unit === 'ms' ? num : num * 1000));
    }
  }
  return undefined;
}

export function computeBoundedBackoffMs(attemptIndex: number, providerHintMs?: number, jitterFactor = 0.2): number {
  if (typeof providerHintMs === 'number' && providerHintMs > 0) {
    return Math.min(MAX_BACKOFF_MS, Math.max(250, providerHintMs));
  }
  const exp = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attemptIndex));
  const jitter = Math.round(exp * jitterFactor * Math.random());
  return Math.min(MAX_BACKOFF_MS, exp + jitter);
}

export function formatUpstreamErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error?.message) {
        const codePart = parsed.error.code ? `HTTP ${parsed.error.code}` : parsed.error.status || 'Upstream';
        return `Live Gemini AI unavailable (${codePart}): ${parsed.error.message}`;
      }
    } catch {
      // Fall through to raw string
    }
  }
  return trimmed;
}

export function classifyGeminiUpstreamError(err: unknown): ClassifiedGeminiError {
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Clinical AI upstream request failed.');
  const sdkStatus =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;

  let jsonCode: number | undefined;
  let jsonStatus = '';
  const jsonStart = rawMessage.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (typeof parsed.error?.code === 'number') jsonCode = parsed.error.code;
      if (typeof parsed.error?.status === 'string') jsonStatus = parsed.error.status;
    } catch {
      // ignore parse failure
    }
  }

  const detectedStatus = sdkStatus ?? jsonCode;
  const formattedMessage = formatUpstreamErrorMessage(rawMessage);
  const retryDelayMs = parseProviderRetryDelayMs(rawMessage);

  // 1. Timeout
  if (/timed out|timeout|DEADLINE_EXCEEDED/i.test(rawMessage) || detectedStatus === 504) {
    return {
      category: 'timeout',
      httpStatus: 504,
      errorCode: 'LIVE_AI_TIMEOUT',
      retryable: true,
      failoverAllowed: true,
      retryDelayMs,
      formattedMessage,
    };
  }

  // 2. Authorization / API key errors — NEVER retry or mask as capacity error
  if (
    detectedStatus === 401 ||
    detectedStatus === 403 ||
    /PERMISSION_DENIED|UNAUTHENTICATED|API_KEY_INVALID|API key not valid/i.test(`${jsonStatus} ${rawMessage}`)
  ) {
    return {
      category: 'auth',
      httpStatus: detectedStatus === 401 ? 401 : 403,
      errorCode: 'LIVE_AI_AUTH_ERROR',
      retryable: false,
      failoverAllowed: false,
      formattedMessage,
    };
  }

  // 3. Unsupported / Not Found model — NEVER treat as transient capacity error
  if (
    detectedStatus === 404 ||
    /NOT_FOUND|is not found for API version|not supported for generateContent/i.test(`${jsonStatus} ${rawMessage}`)
  ) {
    return {
      category: 'unsupported_model',
      httpStatus: 404,
      errorCode: 'LIVE_AI_MODEL_UNSUPPORTED',
      retryable: false,
      failoverAllowed: true,
      formattedMessage,
    };
  }

  // 4. Invalid argument / bad request — non-retryable client/schema error
  if (detectedStatus === 400 || /INVALID_ARGUMENT/i.test(`${jsonStatus} ${rawMessage}`)) {
    return {
      category: 'bad_request',
      httpStatus: 400,
      errorCode: 'LIVE_AI_ERROR',
      retryable: false,
      failoverAllowed: false,
      formattedMessage,
    };
  }

  // 5. Rate limit / quota exhaustion — bounded retry, then failover
  if (detectedStatus === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(`${jsonStatus} ${rawMessage}`)) {
    return {
      category: 'rate_limit',
      httpStatus: 429,
      errorCode: 'LIVE_AI_RATE_LIMITED',
      retryable: true,
      failoverAllowed: true,
      retryDelayMs,
      formattedMessage,
    };
  }

  // 6. Transient upstream capacity / 5xx unavailability
  if (
    detectedStatus === 503 ||
    detectedStatus === 500 ||
    detectedStatus === 502 ||
    /503|UNAVAILABLE|high demand|overloaded|INTERNAL|temporarily unavailable/i.test(`${jsonStatus} ${rawMessage}`)
  ) {
    return {
      category: 'capacity_transient',
      httpStatus: detectedStatus && detectedStatus >= 500 ? detectedStatus : 503,
      errorCode: 'LIVE_AI_CAPACITY_UNAVAILABLE',
      retryable: true,
      failoverAllowed: true,
      retryDelayMs,
      formattedMessage,
    };
  }

  return {
    category: 'unknown',
    httpStatus: detectedStatus ?? 502,
    errorCode: 'LIVE_AI_ERROR',
    retryable: false,
    failoverAllowed: true,
    formattedMessage,
  };
}

function isValidGeminiKey(key: string | undefined): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 16) return false;
  if (trimmed === 'MY_GEMINI_API_KEY' || trimmed.includes('YOUR_')) return false;
  return true;
}

function getClinicalGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isValidGeminiKey(apiKey)) return null;
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Clinical AI request timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

class ClinicalAiUpstreamFailure extends Error {
  readonly classified: ClassifiedGeminiError;
  readonly attemptTrace: ClinicalAIModelAttempt[];
  readonly fallbackAttempted: boolean;
  readonly lastModelId: string;

  constructor(
    classified: ClassifiedGeminiError,
    attemptTrace: ClinicalAIModelAttempt[],
    fallbackAttempted: boolean,
    lastModelId: string
  ) {
    super(classified.formattedMessage);
    this.classified = classified;
    this.attemptTrace = attemptTrace;
    this.fallbackAttempted = fallbackAttempted;
    this.lastModelId = lastModelId;
  }
}

async function callSingleGeminiModelStructuredJson(
  ai: GoogleGenAI,
  modelId: string,
  params: {
    systemInstruction: string;
    contents: string;
    responseSchema: Record<string, unknown>;
  }
): Promise<{ parsed: unknown; latencyMs: number }> {
  const startedAt = Date.now();
  const config: Record<string, unknown> = {
    systemInstruction: params.systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: params.responseSchema,
  };
  if (modelId === 'gemini-4-hydrogen') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  const response = await withTimeout(
    ai.models.generateContent({
      model: modelId,
      contents: params.contents,
      config: config as never,
    }),
    CLINICAL_AI_TIMEOUT_MS
  );

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error(`Gemini (${modelId}) returned an empty response for clinical JSON schema.`);
  }
  return { parsed: JSON.parse(text), latencyMs: Date.now() - startedAt };
}

async function callGeminiStructuredJson(
  ai: GoogleGenAI,
  params: {
    systemInstruction: string;
    contents: string;
    responseSchema: Record<string, unknown>;
    candidateModels?: string[];
  }
): Promise<{
  parsed: unknown;
  modelUsed: string;
  fallbackAttempted: boolean;
  attemptTrace: ClinicalAIModelAttempt[];
}> {
  const baseModels =
    params.candidateModels && params.candidateModels.length > 0
      ? params.candidateModels
      : [CLINICAL_AI_TEXT_MODEL, ...CLINICAL_AI_FALLBACK_MODELS];
  const candidateModels =
    params.candidateModels && params.candidateModels.length > 0
      ? baseModels
      : orderModelsWithCooldown(baseModels, modelTransientCooldownUntil);
  const attemptTrace: ClinicalAIModelAttempt[] = [];
  let lastClassified: ClassifiedGeminiError | null = null;
  let lastModelId = candidateModels[0];

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx += 1) {
    const modelId = candidateModels[mIdx];
    lastModelId = modelId;
    const hasNextFallback = mIdx < candidateModels.length - 1;
    const isCoolingModel = (modelTransientCooldownUntil.get(modelId) ?? 0) > Date.now();
    const maxAttemptsForModel =
      !isCoolingModel && mIdx === 0 ? MAX_PRIMARY_ATTEMPTS : MAX_FALLBACK_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttemptsForModel; attempt += 1) {
      const attemptStart = Date.now();
      try {
        const { parsed, latencyMs } = await callSingleGeminiModelStructuredJson(ai, modelId, params);
        modelTransientCooldownUntil.delete(modelId);
        attemptTrace.push({
          modelId,
          attempt,
          httpStatus: 200,
          outcome: 'success',
          latencyMs,
        });
        return {
          parsed,
          modelUsed: modelId,
          fallbackAttempted: modelId !== CLINICAL_AI_TEXT_MODEL,
          attemptTrace,
        };
      } catch (err) {
        const latencyMs = Date.now() - attemptStart;
        const classified = classifyGeminiUpstreamError(err);
        lastClassified = classified;

        const isLastAttemptForModel = attempt >= maxAttemptsForModel;
        const shouldRetrySameModel = classified.retryable && !isLastAttemptForModel;
        const delayMs = shouldRetrySameModel
          ? computeBoundedBackoffMs(attempt - 1, classified.retryDelayMs)
          : undefined;

        attemptTrace.push({
          modelId,
          attempt,
          httpStatus: classified.httpStatus,
          outcome:
            classified.category === 'timeout'
              ? 'timeout'
              : classified.retryable
              ? 'transient-error'
              : 'non-retryable-error',
          latencyMs,
          retryDelayMs: delayMs,
          errorCode: classified.errorCode,
          errorMessage: classified.formattedMessage,
        });

        // Auth or bad-request errors must stop immediately — never retry or mask via failover
        if (!classified.failoverAllowed) {
          throw new ClinicalAiUpstreamFailure(classified, attemptTrace, modelId !== CLINICAL_AI_TEXT_MODEL, modelId);
        }

        // Unsupported model (404): never retry same model; move straight to fallback if present
        if (classified.category === 'unsupported_model') {
          break;
        }

        if (shouldRetrySameModel && delayMs) {
          await sleep(delayMs);
          continue;
        }

        // Place transiently overloaded/rate-limited model in bounded cooldown so subsequent calls don't hammer it
        if (classified.category === 'capacity_transient' || classified.category === 'rate_limit') {
          modelTransientCooldownUntil.set(modelId, Date.now() + MODEL_TRANSIENT_COOLDOWN_MS);
        }

        // Exhausted bounded retries on this model -> break to try fallback model if available
        if (hasNextFallback) {
          break;
        }
      }
    }
  }

  const finalClassified =
    lastClassified ??
    classifyGeminiUpstreamError(new Error('Clinical AI generation failed across configured models.'));
  throw new ClinicalAiUpstreamFailure(
    finalClassified,
    attemptTrace,
    attemptTrace.some((a) => a.modelId !== candidateModels[0]),
    lastModelId
  );
}

const DOCUMENT_INTELLIGENCE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      description:
        'One of: Laboratory Report, Discharge Summary, Prescription Document, Imaging Report, Clinical Consultation Note, Other Medical Document',
    },
    documentDate: { type: Type.STRING },
    laboratoryOrFacilityIdentity: { type: Type.STRING },
    extractedPatientIdentity: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING },
        dob: { type: Type.STRING },
        phone: { type: Type.STRING },
        mrnOrExternalId: { type: Type.STRING },
        abhaOptional: { type: Type.STRING },
      },
      required: ['fullName'],
    },
    summary: { type: Type.STRING },
    labMeasurements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          testName: { type: Type.STRING },
          originalValue: { type: Type.STRING },
          originalUnit: { type: Type.STRING },
          referenceRange: { type: Type.STRING },
          sampleOrResultDate: { type: Type.STRING },
          laboratoryIdentity: { type: Type.STRING },
          flag: { type: Type.STRING },
          sourceSnippet: { type: Type.STRING },
          uncertain: { type: Type.BOOLEAN },
          uncertaintyReason: { type: Type.STRING },
        },
        required: ['testName', 'originalValue', 'originalUnit', 'referenceRange', 'sourceSnippet', 'uncertain'],
      },
    },
    extractedFields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          value: { type: Type.STRING },
          originalUnit: { type: Type.STRING },
          referenceRange: { type: Type.STRING },
          targetSection: { type: Type.STRING },
          sourceLocation: { type: Type.STRING },
          sourceSnippet: { type: Type.STRING },
          confidence: { type: Type.STRING },
          uncertain: { type: Type.BOOLEAN },
          uncertaintyReason: { type: Type.STRING },
        },
        required: ['label', 'value', 'targetSection', 'sourceLocation', 'sourceSnippet', 'confidence', 'uncertain'],
      },
    },
    missingOrAmbiguousFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    identitySafetyNote: { type: Type.STRING },
  },
  required: [
    'documentType',
    'documentDate',
    'laboratoryOrFacilityIdentity',
    'extractedPatientIdentity',
    'summary',
    'labMeasurements',
    'extractedFields',
    'missingOrAmbiguousFlags',
  ],
};

const PRE_CONSULTATION_BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    whatMattersTodayHeadline: { type: Type.STRING },
    whatMattersTodayBullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['text', 'sourceIds'],
      },
    },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          section: { type: Type.STRING },
          headline: { type: Type.STRING },
          detail: { type: Type.STRING },
          sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          evidenceType: { type: Type.STRING },
          uncertain: { type: Type.BOOLEAN },
        },
        required: ['section', 'headline', 'detail', 'sourceIds', 'evidenceType'],
      },
    },
    missingClinicalData: { type: Type.ARRAY, items: { type: Type.STRING } },
    conflictingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
    uncertaintyIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'whatMattersTodayHeadline',
    'whatMattersTodayBullets',
    'sections',
    'missingClinicalData',
    'conflictingInformation',
    'uncertaintyIndicators',
  ],
};

const CHART_NARRATIVE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    incompleteOrMissingNote: { type: Type.STRING },
  },
  required: ['answer', 'sourceIds'],
};

const AMBIENT_SCRIBE_V2_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    soap: {
      type: Type.OBJECT,
      properties: {
        subjective: { type: Type.STRING },
        objective: { type: Type.STRING },
        assessment: { type: Type.STRING },
        plan: { type: Type.STRING },
      },
      required: ['subjective', 'objective', 'assessment', 'plan'],
    },
    supportingTranscriptQuotes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          quote: { type: Type.STRING },
        },
        required: ['section', 'quote'],
      },
    },
    unsupportedOrUncertainStatements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          statement: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['section', 'statement', 'reason'],
      },
    },
    medicationsMentionedAsProposalsOnly: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'soap',
    'supportingTranscriptQuotes',
    'unsupportedOrUncertainStatements',
    'medicationsMentionedAsProposalsOnly',
  ],
};

const ACTION_COMPOSER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    proposals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          kind: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          supportingSourceText: { type: Type.STRING },
          sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          rationale: { type: Type.STRING },
          confidence: { type: Type.STRING },
          uncertaintyNote: { type: Type.STRING },
          payloadName: { type: Type.STRING },
          payloadCode: { type: Type.STRING },
          payloadPriority: { type: Type.STRING },
          payloadDose: { type: Type.STRING },
          payloadFrequency: { type: Type.STRING },
          payloadInterval: { type: Type.STRING },
          payloadInstructions: { type: Type.STRING },
          payloadSpecialty: { type: Type.STRING },
        },
        required: ['kind', 'title', 'summary', 'supportingSourceText', 'sourceIds', 'rationale', 'confidence'],
      },
    },
  },
  required: ['proposals'],
};

const SUPPORTED_OPERATIONS: ClinicalAIOperation[] = [
  'document-intelligence',
  'pre-consultation-brief',
  'chart-search',
  'ambient-scribe-v2',
  'action-composer',
];

export function createClinicalAiRouter(): Router {
  const router = express.Router();

  router.get('/status', (_req, res) => {
    const configured = isValidGeminiKey(process.env.GEMINI_API_KEY);
    res.json({
      configured,
      provider: configured ? 'gemini' : 'none',
      model: CLINICAL_AI_TEXT_MODEL,
      fallbackModel: CLINICAL_AI_FALLBACK_MODEL,
      fallbackModels: [...CLINICAL_AI_FALLBACK_MODELS],
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      syntheticOnly: true,
      supportedOperations: SUPPORTED_OPERATIONS,
      missingReason: configured
        ? undefined
        : 'GEMINI_API_KEY is not configured in server environment. Use Deterministic Demo mode or configure GEMINI_API_KEY in Settings > Secrets.',
    });
  });

  // Server-side model availability inspection (zero secrets exposed)
  router.get('/models', async (_req, res) => {
    const ai = getClinicalGeminiClient();
    if (!ai) {
      res.status(503).json({
        ok: false,
        configured: false,
        error: 'GEMINI_API_KEY is not configured in server environment.',
      });
      return;
    }
    const startedAt = Date.now();
    try {
      const pager = await withTimeout(ai.models.list(), CLINICAL_AI_TIMEOUT_MS);
      const availableModels: Array<{
        id: string;
        name: string;
        displayName?: string;
        supportedActions?: string[];
      }> = [];
      for await (const m of pager) {
        if (!m.name) continue;
        const bareId = m.name.replace(/^models\//, '');
        if (/gemini/i.test(bareId)) {
          availableModels.push({
            id: bareId,
            name: m.name,
            displayName: m.displayName,
            supportedActions: m.supportedActions,
          });
        }
      }
      const ids = new Set(availableModels.map((m) => m.id));
      res.json({
        ok: true,
        configured: true,
        latencyMs: Date.now() - startedAt,
        primaryModel: CLINICAL_AI_TEXT_MODEL,
        primaryListed: ids.has(CLINICAL_AI_TEXT_MODEL),
        fallbackModel: CLINICAL_AI_FALLBACK_MODEL,
        fallbackListed: ids.has(CLINICAL_AI_FALLBACK_MODEL),
        geminiGenerateContentModels: availableModels
          .filter((m) => !m.supportedActions || m.supportedActions.includes('generateContent'))
          .map((m) => ({
            id: m.id,
            displayName: m.displayName,
          })),
      });
    } catch (err) {
      const classified = classifyGeminiUpstreamError(err);
      res.status(classified.httpStatus).json({
        ok: false,
        configured: true,
        latencyMs: Date.now() - startedAt,
        errorCode: classified.errorCode,
        message: classified.formattedMessage,
      });
    }
  });

  // Independent small synthetic model probe for primary / fallback verification
  router.post('/probe', async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || body.syntheticOnly !== true) {
      res.status(400).json({ ok: false, error: 'syntheticOnly: true is required.' });
      return;
    }
    const ai = getClinicalGeminiClient();
    if (!ai) {
      res.status(503).json({ ok: false, error: 'GEMINI_API_KEY is not configured.' });
      return;
    }
    const allowedProbeModels = new Set([
      CLINICAL_AI_TEXT_MODEL,
      ...CLINICAL_AI_FALLBACK_MODELS,
      'gemini-3.1-flash-lite',
    ]);
    const requestedModel =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : CLINICAL_AI_TEXT_MODEL;
    if (!allowedProbeModels.has(requestedModel)) {
      res.status(400).json({
        ok: false,
        error: `Probe model must be one of configured clinical models: ${Array.from(allowedProbeModels).join(', ')}.`,
      });
      return;
    }

    const probeSchema = {
      type: Type.OBJECT,
      properties: {
        patientName: { type: Type.STRING },
        labName: { type: Type.STRING },
        labValue: { type: Type.STRING },
        requiresClinicianReview: { type: Type.BOOLEAN },
      },
      required: ['patientName', 'labName', 'labValue', 'requiresClinicianReview'],
    };

    const startedAt = Date.now();
    try {
      const { parsed, latencyMs } = await callSingleGeminiModelStructuredJson(ai, requestedModel, {
        systemInstruction:
          'Extract the synthetic patient name, lab name, lab value, and confirm requiresClinicianReview=true as strict JSON.',
        contents: 'SYNTHETIC TEST INPUT: Patient Kavita Rao has Hemoglobin A1c of 7.9 %. Clinician review required.',
        responseSchema: probeSchema,
      });
      const obj = parsed as Record<string, unknown>;
      const schemaValid =
        typeof obj?.patientName === 'string' &&
        typeof obj?.labName === 'string' &&
        typeof obj?.labValue === 'string' &&
        obj?.requiresClinicianReview === true;
      res.json({
        ok: true,
        modelId: requestedModel,
        httpStatus: 200,
        latencyMs,
        schemaValid,
        parsed: obj,
      });
    } catch (err) {
      const classified = classifyGeminiUpstreamError(err);
      res.status(classified.httpStatus).json({
        ok: false,
        modelId: requestedModel,
        httpStatus: classified.httpStatus,
        latencyMs: Date.now() - startedAt,
        category: classified.category,
        errorCode: classified.errorCode,
        retryable: classified.retryable,
        retryDelayMs: classified.retryDelayMs,
        message: classified.formattedMessage,
      });
    }
  });

  router.post('/execute', async (req, res) => {
    const startedAt = Date.now();
    const body = req.body as Record<string, unknown> | undefined;
    const requestId = typeof body?.requestId === 'string' && body.requestId.trim() ? body.requestId.trim() : `req-${Date.now()}`;
    const idempotencyKey =
      typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : requestId;
    const operation = body?.operation;

    const sendError = (
      httpStatus: number,
      code: NonNullable<ClinicalAIResponse['error']>['code'],
      message: string,
      retryable = false,
      extra?: {
        modelId?: string;
        fallbackAttempted?: boolean;
        attemptTrace?: ClinicalAIModelAttempt[];
      }
    ) => {
      const resp: ClinicalAIResponse = {
        ok: false,
        requestId,
        idempotencyKey,
        operation: isSupportedOperation(operation) ? operation : 'document-intelligence',
        executionMode: 'live-ai',
        modelId: extra?.modelId ?? CLINICAL_AI_TEXT_MODEL,
        promptVersion: CLINICAL_AI_PROMPT_VERSION,
        schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
        status: code === 'LIVE_AI_UNCONFIGURED' ? 'Unavailable' : code === 'SCHEMA_VALIDATION_FAILED' ? 'Validation Failed' : 'Error',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
        humanReviewState: 'Draft — Review Required',
        inputSourceIds: [],
        warnings: [],
        fallbackAttempted: extra?.fallbackAttempted,
        attemptTrace: extra?.attemptTrace,
        error: { code, message, retryable, httpStatus },
      };
      res.status(httpStatus).json(resp);
    };

    if (!body || body.syntheticOnly !== true) {
      sendError(400, 'INVALID_REQUEST', 'Clinical AI prototype strictly requires syntheticOnly: true (real PHI is prohibited).');
      return;
    }

    if (!isSupportedOperation(operation)) {
      sendError(400, 'INVALID_REQUEST', `Unsupported Clinical AI operation "${String(operation)}".`);
      return;
    }

    const input = body.input as Record<string, unknown> | undefined;
    if (!input || typeof input !== 'object') {
      sendError(400, 'INVALID_REQUEST', 'Request input payload must be a JSON object.');
      return;
    }

    const ai = getClinicalGeminiClient();
    if (!ai) {
      sendError(
        503,
        'LIVE_AI_UNCONFIGURED',
        'Live AI (Gemini) is unavailable because GEMINI_API_KEY is not configured on the server. Switch explicitly to Deterministic Demo mode or configure the server secret.',
        false
      );
      return;
    }

    try {
      if (operation === 'document-intelligence') {
        const rawText = typeof input.rawText === 'string' ? input.rawText.trim() : '';
        const title = typeof input.title === 'string' ? input.title.trim() : 'Synthetic Clinical Document';
        const sourceOrg = typeof input.sourceOrganization === 'string' ? input.sourceOrganization.trim() : 'External Facility';
        if (!rawText || rawText.length > MAX_PROMPT_CHARS) {
          sendError(400, 'INVALID_REQUEST', `rawText must be between 1 and ${MAX_PROMPT_CHARS} characters.`);
          return;
        }

        const { parsed: rawJson, modelUsed, fallbackAttempted, attemptTrace } = await callGeminiStructuredJson(ai, {
          systemInstruction:
            'You are EigenH Clinical Document Intelligence operating strictly on SYNTHETIC EHR documents. ' +
            'Extract structured proposals ONLY from the provided document text. ' +
            'CRITICAL SAFETY RULES: ' +
            '1) Preserve original values and original units exactly as printed; never silently normalize units. ' +
            '2) NEVER invent a missing reference range; if a lab line has no printed reference range, set referenceRange to "Not stated in source document" and set uncertain=true with an uncertaintyReason. ' +
            '3) Extract patient identity fields exactly as printed; if DOB/phone/MRN are absent, flag missing secondary identifiers in missingOrAmbiguousFlags. ' +
            '4) targetSection must be one of: Condition, Lab, Imaging, Medication, Allergy, History, Demographics. ' +
            '5) confidence must be High, Medium, or Low. ' +
            '6) Flag missing, inconsistent, or ambiguous statements clearly. Never diagnose.',
          contents: `Document Title: ${title}\nSource Organization: ${sourceOrg}\n\nDocument Content:\n${rawText}`,
          responseSchema: DOCUMENT_INTELLIGENCE_SCHEMA,
        });

        const validated = validateDocumentIntelligenceOutput(rawJson, rawText);
        if (!validated.valid || !validated.sanitized) {
          sendError(422, 'SCHEMA_VALIDATION_FAILED', validated.errors.join(' '), false, {
            modelId: modelUsed,
            fallbackAttempted,
            attemptTrace,
          });
          return;
        }

        const documentId = typeof input.documentId === 'string' ? input.documentId : 'doc-upload';
        res.json({
          ok: true,
          requestId,
          idempotencyKey,
          operation,
          executionMode: 'live-ai',
          modelId: modelUsed,
          promptVersion: CLINICAL_AI_PROMPT_VERSION,
          schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
          status: 'Draft Ready',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
          humanReviewState: 'Draft — Review Required',
          inputSourceIds: [documentId],
          warnings: validated.warnings,
          fallbackAttempted,
          attemptTrace,
          data: validated.sanitized,
        } satisfies ClinicalAIResponse);
        return;
      }

      if (operation === 'pre-consultation-brief') {
        const patientContextJson = typeof input.patientContextJson === 'string' ? input.patientContextJson : '';
        const allowedSourceIds = Array.isArray(input.allowedSourceIds)
          ? input.allowedSourceIds.filter((x): x is string => typeof x === 'string')
          : [];
        const hasRecordedAllergies = Boolean(input.hasRecordedAllergies);

        if (!patientContextJson || patientContextJson.length > MAX_PROMPT_CHARS) {
          sendError(400, 'INVALID_REQUEST', 'Invalid or oversized patientContextJson.');
          return;
        }

        const { parsed: rawJson, modelUsed, fallbackAttempted, attemptTrace } = await callGeminiStructuredJson(ai, {
          systemInstruction:
            'You are EigenH Pre-Consultation Clinical Intelligence operating strictly on SYNTHETIC patient records. ' +
            'Synthesize a concise, clinician-ready pre-consultation brief grounded EXCLUSIVELY in the provided JSON context. ' +
            'CRITICAL SAFETY RULES: ' +
            '1) Every bullet and section MUST cite one or more exact sourceId values from the provided JSON. Never invent IDs or facts. ' +
            '2) NEVER transform absence of recorded allergies into "NKDA" or "no known allergies". ' +
            '3) NEVER interpret missing labs as normal. ' +
            '4) NEVER create a new diagnosis from abnormal lab values; state observations only. ' +
            '5) section must be one of: Reason for Visit, Relevant Medical History, Recent Clinical Events, Medications & Allergies, Laboratory Trends, Significant Prior Reports, Unreviewed Information, Outstanding Actions. ' +
            '6) evidenceType must be one of: Source-Grounded Fact, AI Synthesis (Review Required), Missing / Conflict Alert. ' +
            '7) Keep bullets and section details concise (1-2 sentences each).',
          contents: `Permitted Synthetic Patient Chart Context:\n${patientContextJson}`,
          responseSchema: PRE_CONSULTATION_BRIEF_SCHEMA,
        });

        const validated = validatePreConsultationBriefOutput(rawJson, allowedSourceIds, hasRecordedAllergies);
        if (!validated.valid || !validated.sanitized) {
          sendError(422, 'SCHEMA_VALIDATION_FAILED', validated.errors.join(' '), false, {
            modelId: modelUsed,
            fallbackAttempted,
            attemptTrace,
          });
          return;
        }

        res.json({
          ok: true,
          requestId,
          idempotencyKey,
          operation,
          executionMode: 'live-ai',
          modelId: modelUsed,
          promptVersion: CLINICAL_AI_PROMPT_VERSION,
          schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
          status: 'Draft Ready',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
          humanReviewState: 'Draft — Review Required',
          inputSourceIds: allowedSourceIds,
          warnings: validated.warnings,
          fallbackAttempted,
          attemptTrace,
          data: validated.sanitized,
        } satisfies ClinicalAIResponse);
        return;
      }

      if (operation === 'chart-search') {
        const question = typeof input.question === 'string' ? input.question.trim() : '';
        const patientContextJson = typeof input.patientContextJson === 'string' ? input.patientContextJson : '';
        const allowedSourceIds = Array.isArray(input.allowedSourceIds)
          ? input.allowedSourceIds.filter((x): x is string => typeof x === 'string')
          : [];

        if (!question || !patientContextJson || patientContextJson.length > MAX_PROMPT_CHARS) {
          sendError(400, 'INVALID_REQUEST', 'question and patientContextJson are required.');
          return;
        }

        const { parsed: rawJson, modelUsed, fallbackAttempted, attemptTrace } = await callGeminiStructuredJson(ai, {
          systemInstruction:
            'You are Ask EigenH Clinical Chart Search operating strictly on ONE selected SYNTHETIC patient chart. ' +
            'Answer the clinician narrative question using ONLY the provided patient JSON. ' +
            'CRITICAL SAFETY RULES: ' +
            '1) NEVER invent numerical values, dates, diagnoses, or medications not in the JSON. ' +
            '2) Cite exact sourceId values from the JSON in sourceIds. ' +
            '3) If the chart does not contain relevant information, explicitly state that it is not recorded and explain in incompleteOrMissingNote. ' +
            '4) Do not provide clinical treatment advice or autonomous diagnoses.',
          contents: `Clinician Question: ${question}\n\nPermitted Synthetic Patient Chart JSON:\n${patientContextJson}`,
          responseSchema: CHART_NARRATIVE_SCHEMA,
        });

        const validated = validateChartNarrativeOutput(rawJson, allowedSourceIds);
        if (!validated.valid || !validated.sanitized) {
          sendError(422, 'SCHEMA_VALIDATION_FAILED', validated.errors.join(' '), false, {
            modelId: modelUsed,
            fallbackAttempted,
            attemptTrace,
          });
          return;
        }

        res.json({
          ok: true,
          requestId,
          idempotencyKey,
          operation,
          executionMode: 'live-ai',
          modelId: modelUsed,
          promptVersion: CLINICAL_AI_PROMPT_VERSION,
          schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
          status: 'Draft Ready',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
          humanReviewState: 'Draft — Review Required',
          inputSourceIds: validated.sanitized.sourceIds,
          warnings: validated.warnings,
          fallbackAttempted,
          attemptTrace,
          data: validated.sanitized,
        } satisfies ClinicalAIResponse);
        return;
      }

      if (operation === 'ambient-scribe-v2') {
        const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
        const patientContextJson = typeof input.patientContextJson === 'string' ? input.patientContextJson : '{}';
        const draftVersion = typeof input.draftVersion === 'number' ? input.draftVersion : 1;
        const allowedSourceIds = Array.isArray(input.allowedSourceIds)
          ? input.allowedSourceIds.filter((x): x is string => typeof x === 'string')
          : [];

        if (!transcript || transcript.length > MAX_PROMPT_CHARS) {
          sendError(400, 'INVALID_REQUEST', 'Synthetic consultation transcript is required.');
          return;
        }

        const { parsed: rawJson, modelUsed, fallbackAttempted, attemptTrace } = await callGeminiStructuredJson(ai, {
          systemInstruction:
            'You are EigenH Ambient Clinical Scribe V2 operating strictly on SYNTHETIC consultation transcripts. ' +
            'Generate a structured SOAP note draft derived directly from the provided transcript. ' +
            'CRITICAL SAFETY RULES: ' +
            '1) NEVER invent physical examination findings that are not in the transcript or provided vitals. ' +
            '2) NEVER invent a diagnosis; reflect only documented conditions or explicitly label discussed impressions as "Clinician to verify". ' +
            '3) Any medication discussed must be listed in medicationsMentionedAsProposalsOnly and framed as a proposal requiring clinician review/order. ' +
            '4) Highlight every unsupported, incomplete, or uncertain statement in unsupportedOrUncertainStatements with section (subjective|objective|assessment|plan), statement, and reason. ' +
            '5) Quote exact supporting transcript lines in supportingTranscriptQuotes.',
          contents: `Synthetic Consultation Transcript:\n${transcript}\n\nPermitted Patient Context:\n${patientContextJson}`,
          responseSchema: AMBIENT_SCRIBE_V2_SCHEMA,
        });

        const validated = validateAmbientScribeV2Output(rawJson, draftVersion);
        if (!validated.valid || !validated.sanitized) {
          sendError(422, 'SCHEMA_VALIDATION_FAILED', validated.errors.join(' '), false, {
            modelId: modelUsed,
            fallbackAttempted,
            attemptTrace,
          });
          return;
        }

        res.json({
          ok: true,
          requestId,
          idempotencyKey,
          operation,
          executionMode: 'live-ai',
          modelId: modelUsed,
          promptVersion: CLINICAL_AI_PROMPT_VERSION,
          schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
          status: 'Draft Ready',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
          humanReviewState: 'Draft — Review Required',
          inputSourceIds: allowedSourceIds,
          warnings: validated.warnings,
          fallbackAttempted,
          attemptTrace,
          data: validated.sanitized,
        } satisfies ClinicalAIResponse);
        return;
      }

      if (operation === 'action-composer') {
        const encounterId = typeof input.encounterId === 'string' ? input.encounterId : 'enc-active';
        const soap = input.soap as Record<string, unknown> | undefined;
        const patientContextJson = typeof input.patientContextJson === 'string' ? input.patientContextJson : '{}';
        const allowedSourceIds = Array.isArray(input.allowedSourceIds)
          ? input.allowedSourceIds.filter((x): x is string => typeof x === 'string')
          : [];

        if (!soap || typeof soap !== 'object') {
          sendError(400, 'INVALID_REQUEST', 'Reviewed SOAP object is required for Action Composer.');
          return;
        }

        const { parsed: rawJson, modelUsed, fallbackAttempted, attemptTrace } = await callGeminiStructuredJson(ai, {
          systemInstruction:
            'You are EigenH AI Clinical Action Composer operating strictly on a clinician-reviewed SYNTHETIC SOAP note. ' +
            'Extract reviewable downstream workflow proposals ONLY when explicitly supported by the SOAP Plan/Assessment. ' +
            'CRITICAL SAFETY RULES: ' +
            '1) kind MUST be one of: Lab Order, Medication Draft, Task, Follow-Up Plan, Patient Message, Referral. ' +
            '2) Every proposal MUST include supportingSourceText quoted from the SOAP note and exact sourceIds from the context. ' +
            '3) Do NOT invent orders, referrals, or medications not grounded in the SOAP note. ' +
            '4) Clearly populate payloadName/payloadCode/payloadPriority for Lab Order; payloadName/payloadDose/payloadFrequency for Medication Draft; payloadInterval/payloadInstructions for Follow-Up Plan/Task/Patient Message; payloadSpecialty for Referral. ' +
            '5) All proposals are drafts requiring individual clinician authorization.',
          contents: `Reviewed SOAP Note:\n${JSON.stringify(soap, null, 2)}\n\nPermitted Patient Context:\n${patientContextJson}`,
          responseSchema: ACTION_COMPOSER_SCHEMA,
        });

        // Map flat Gemini schema payload fields into structured payload record before validation
        const rawObj = rawJson as { proposals?: Array<Record<string, unknown>> };
        const normalized = {
          proposals: Array.isArray(rawObj?.proposals)
            ? rawObj.proposals.map((p) => ({
                ...p,
                payload: {
                  ...(typeof p.payloadName === 'string' && p.payloadName ? { name: p.payloadName } : {}),
                  ...(typeof p.payloadCode === 'string' && p.payloadCode ? { code: p.payloadCode } : {}),
                  ...(typeof p.payloadPriority === 'string' && p.payloadPriority ? { priority: p.payloadPriority } : {}),
                  ...(typeof p.payloadDose === 'string' && p.payloadDose ? { dose: p.payloadDose } : {}),
                  ...(typeof p.payloadFrequency === 'string' && p.payloadFrequency ? { frequency: p.payloadFrequency } : {}),
                  ...(typeof p.payloadInterval === 'string' && p.payloadInterval ? { interval: p.payloadInterval } : {}),
                  ...(typeof p.payloadInstructions === 'string' && p.payloadInstructions
                    ? { instructions: p.payloadInstructions, body: p.payloadInstructions }
                    : {}),
                  ...(typeof p.payloadSpecialty === 'string' && p.payloadSpecialty
                    ? { specialty: p.payloadSpecialty }
                    : {}),
                },
              }))
            : [],
        };

        const validated = validateActionComposerOutput(normalized, encounterId, allowedSourceIds);
        if (!validated.valid || !validated.sanitized) {
          sendError(422, 'SCHEMA_VALIDATION_FAILED', validated.errors.join(' '), false, {
            modelId: modelUsed,
            fallbackAttempted,
            attemptTrace,
          });
          return;
        }

        res.json({
          ok: true,
          requestId,
          idempotencyKey,
          operation,
          executionMode: 'live-ai',
          modelId: modelUsed,
          promptVersion: CLINICAL_AI_PROMPT_VERSION,
          schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
          status: 'Draft Ready',
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
          humanReviewState: 'Draft — Review Required',
          inputSourceIds: allowedSourceIds,
          warnings: validated.warnings,
          fallbackAttempted,
          attemptTrace,
          data: validated.sanitized,
        } satisfies ClinicalAIResponse);
        return;
      }
    } catch (err) {
      if (err instanceof ClinicalAiUpstreamFailure) {
        sendError(
          err.classified.httpStatus,
          err.classified.errorCode,
          err.classified.formattedMessage,
          err.classified.retryable,
          {
            modelId: err.lastModelId,
            fallbackAttempted: err.fallbackAttempted,
            attemptTrace: err.attemptTrace,
          }
        );
        return;
      }
      const classified = classifyGeminiUpstreamError(err);
      sendError(classified.httpStatus, classified.errorCode, classified.formattedMessage, classified.retryable);
    }
  });

  return router;
}
