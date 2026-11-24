import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioAssetCache, buildAudioCacheKey } from './audioAssetCache';
import {
  mapDemoSpeedToNaturalSpeechRate,
  NarrationQualityDiagnostics,
  PlaybackCancellationManager,
} from './narrationPlaybackController';
import { REGISTRATION_CONSOLIDATION_SCENARIO } from '../registrationConsolidationScenario';
import {
  EHR_PRONUNCIATION_GLOSSARY,
  ensureSentencePunctuation,
  extractFinalWord,
  getAuthoritativeCaption,
  NARRATION_SCRIPT_VERSION,
  prepareSpokenText,
  splitIntoCompleteSentences,
} from './pronunciationGlossary';

describe('EigenH Voice Narration Engine', () => {
  it('applies EHR clinical pronunciation glossary without altering meaning or dropping final words', () => {
    assert.ok(EHR_PRONUNCIATION_GLOSSARY.length >= 20);
    const spoken = prepareSpokenText(
      'Front Desk exports FHIR R4 for MRN-109420 with BP 146/88 mmHg, SpO2 99%, and eGFR 48 mL/min/1.73m2'
    );
    assert.match(spoken, /Fire R 4/);
    assert.match(spoken, /medical record number 109420/);
    assert.match(spoken, /146 over 88 millimeters of mercury/);
    assert.match(spoken, /oxygen saturation/);
    assert.match(spoken, /estimated G F R/);
    assert.ok(spoken.endsWith('.'), 'Spoken text must end with complete sentence punctuation');
  });

  it('splits multi-sentence paragraphs cleanly without breaking Dr. abbreviations or decimal lab values', () => {
    const sentences = splitIntoCompleteSentences(
      'Dr. Elena Rostova reviews HbA1c 7.4% and eGFR 48.5. Then she signs the SOAP note.'
    );
    assert.equal(sentences.length, 2);
    assert.equal(sentences[0], 'Dr. Elena Rostova reviews HbA1c 7.4% and eGFR 48.5.');
    assert.equal(sentences[1], 'Then she signs the SOAP note.');
    assert.equal(extractFinalWord(sentences[1]), 'note');
    assert.equal(ensureSentencePunctuation('Ready for visit'), 'Ready for visit.');
  });

  it('enforces LRU audio clip caching with deterministic cache keys', () => {
    const cache = new AudioAssetCache(2);
    const k1 = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      voiceId: 'Kore',
      locale: 'en-US',
      text: 'Sentence one.',
    });
    const k2 = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      voiceId: 'Kore',
      locale: 'en-US',
      text: 'Sentence two.',
    });
    const k3 = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      voiceId: 'Kore',
      locale: 'en-US',
      text: 'Sentence three.',
    });

    cache.set({ key: k1, objectUrl: 'mock:1', byteLength: 1024, durationSec: 2, createdAt: 1, provider: 'gemini-neural', voiceId: 'Kore' });
    cache.set({ key: k2, objectUrl: 'mock:2', byteLength: 1024, durationSec: 2, createdAt: 2, provider: 'gemini-neural', voiceId: 'Kore' });
    // Touch k1 so k2 becomes least-recently-used
    assert.ok(cache.get(k1));
    cache.set({ key: k3, objectUrl: 'mock:3', byteLength: 1024, durationSec: 2, createdAt: 3, provider: 'gemini-neural', voiceId: 'Kore' });

    assert.equal(cache.size(), 2);
    assert.equal(cache.has(k1), true);
    assert.equal(cache.has(k2), false);
    assert.equal(cache.has(k3), true);
  });

  it('prevents stale generation callbacks from cancelling active speech and detects suspected truncation', () => {
    const mgr = new PlaybackCancellationManager();
    const g1 = mgr.nextGeneration();
    assert.equal(mgr.isCurrent(g1), true);
    const g2 = mgr.nextGeneration();
    assert.equal(mgr.isCurrent(g1), false);
    assert.equal(mgr.isCurrent(g2), true);

    const diag = new NarrationQualityDiagnostics();
    const natural = diag.record({
      generationId: g2,
      sceneId: 's1',
      providerUsed: 'browser-fallback',
      voiceId: 'browser:en-US',
      reason: 'ended',
      completedNaturally: true,
      expectedDurationSec: 4.0,
      actualElapsedMs: 3900,
      spokenText: 'Registration is complete.',
    });
    assert.equal(natural.truncatedSuspected, false);
    assert.equal(natural.finalWord, 'complete');

    const truncated = diag.record({
      generationId: g2,
      sceneId: 's2',
      providerUsed: 'browser-fallback',
      voiceId: 'browser:en-US',
      reason: 'ended',
      completedNaturally: true,
      expectedDurationSec: 5.0,
      actualElapsedMs: 1200,
      spokenText: 'This sentence ended far too early.',
    });
    assert.equal(truncated.truncatedSuspected, true);

    // Speech rate clamping keeps voices natural even at 2x demo speed
    assert.ok(mapDemoSpeedToNaturalSpeechRate(2, 1) <= 1.28);
    assert.ok(mapDemoSpeedToNaturalSpeechRate(0.5, 0.85) >= 0.82);
  });

  it('normalizes India-first terminology and scopes audio cache keys by TTS model', () => {
    const spoken = prepareSpokenText(
      'Patient 360° links optional ABHA ID without live ABDM or LIS sync, reviewing HbA1c, NKDA, WHO ICD-10, US ICD-10-CM, and LOINC PDF.'
    );
    assert.match(spoken, /Patient 360 links/);
    assert.doesNotMatch(spoken, /°/);
    assert.match(spoken, /A B H A/);
    assert.match(spoken, /A B D M/);
    assert.match(spoken, /L I S/);
    assert.match(spoken, /hemoglobin A 1 C/);
    assert.match(spoken, /no known drug allergies/);
    assert.match(spoken, /I C D 10 C M/);
    assert.match(spoken, /Loink/);
    assert.match(spoken, /P D F/);
    assert.ok(/[.!?]$/.test(spoken));

    const liteKey = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      model: 'gemini-3.8-flash-lite-tts',
      voiceId: 'Kore',
      locale: 'en-US',
      text: 'Voice comparison test.',
    });
    const flashKey = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      model: 'gemini-3.8-flash-tts',
      voiceId: 'Kore',
      locale: 'en-US',
      text: 'Voice comparison test.',
    });
    assert.notEqual(
      liteKey,
      flashKey,
      'Flash-Lite and Flash TTS models must never collide in audio clip cache'
    );
  });

  it('verifies every registration tutorial scene ends with complete sentence punctuation', () => {
    assert.equal(REGISTRATION_CONSOLIDATION_SCENARIO.scenes.length, 10);
    for (const scene of REGISTRATION_CONSOLIDATION_SCENARIO.scenes) {
      const fullSpoken = prepareSpokenText(getAuthoritativeCaption(scene, 'watch'));
      const execSpoken = prepareSpokenText(getAuthoritativeCaption(scene, 'executive'));
      assert.ok(
        /[.!?]$/.test(fullSpoken),
        `Scene ${scene.sceneId} narration must end with sentence punctuation`
      );
      assert.ok(
        /[.!?]$/.test(execSpoken),
        `Scene ${scene.sceneId} executive narration must end with sentence punctuation`
      );
      assert.ok(
        extractFinalWord(fullSpoken).length >= 2,
        `Scene ${scene.sceneId} must have a complete final word`
      );
    }
  });
});
