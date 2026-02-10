/**
 * Oh My Ondas - Audio Connections
 * All AudioConnection patch cords wiring the signal chain:
 *
 * Sample Players [0-7] → filters → amps → playerMixers → sampleSum
 * Synth (osc1+osc2+noise) → synthMixer → synthFilter → synthEnv → synthAmp
 * Audio Input → inputMixer
 * sampleSum + synthAmp + inputMixer → masterMix
 * masterMix → fxSend → delay/reverb/bitcrusher/granular/chorus → fxReturn
 * masterMix (dry) + fxReturn (wet) → outputMixer → audioOutput + recorder + peak/fft
 */

#ifndef AUDIO_CONNECTIONS_H
#define AUDIO_CONNECTIONS_H

// ============================================
// Player → Filter → Amp → Mixer chain (8 tracks)
// ============================================

// Players L channel → per-track state variable filters (lowpass)
AudioConnection pc_p0f(player[0], 0, filter[0], 0);
AudioConnection pc_p1f(player[1], 0, filter[1], 0);
AudioConnection pc_p2f(player[2], 0, filter[2], 0);
AudioConnection pc_p3f(player[3], 0, filter[3], 0);
AudioConnection pc_p4f(player[4], 0, filter[4], 0);
AudioConnection pc_p5f(player[5], 0, filter[5], 0);
AudioConnection pc_p6f(player[6], 0, filter[6], 0);
AudioConnection pc_p7f(player[7], 0, filter[7], 0);

// Filters (lowpass output = channel 0) → per-track amplifiers
AudioConnection pc_f0a(filter[0], 0, amp[0], 0);
AudioConnection pc_f1a(filter[1], 0, amp[1], 0);
AudioConnection pc_f2a(filter[2], 0, amp[2], 0);
AudioConnection pc_f3a(filter[3], 0, amp[3], 0);
AudioConnection pc_f4a(filter[4], 0, amp[4], 0);
AudioConnection pc_f5a(filter[5], 0, amp[5], 0);
AudioConnection pc_f6a(filter[6], 0, amp[6], 0);
AudioConnection pc_f7a(filter[7], 0, amp[7], 0);

// Amps → player mixers (4 channels per mixer, 2 mixers)
AudioConnection pc_a0m(amp[0], 0, playerMixL, 0);
AudioConnection pc_a1m(amp[1], 0, playerMixL, 1);
AudioConnection pc_a2m(amp[2], 0, playerMixL, 2);
AudioConnection pc_a3m(amp[3], 0, playerMixL, 3);
AudioConnection pc_a4m(amp[4], 0, playerMixR, 0);
AudioConnection pc_a5m(amp[5], 0, playerMixR, 1);
AudioConnection pc_a6m(amp[6], 0, playerMixR, 2);
AudioConnection pc_a7m(amp[7], 0, playerMixR, 3);

// Player sub-mixers → sample sum mixer
AudioConnection pc_plS(playerMixL, 0, sampleSum, 0);
AudioConnection pc_prS(playerMixR, 0, sampleSum, 1);

// ============================================
// Synth voice chain
// ============================================

// Oscillators + noise → synth mixer
AudioConnection pc_sw1(synthWave1, 0, synthMixer, 0);
AudioConnection pc_sw2(synthWave2, 0, synthMixer, 1);
AudioConnection pc_snm(synthNoise, 0, synthMixer, 2);

// Synth mixer → Moog ladder filter → ADSR envelope
AudioConnection pc_smf(synthMixer, 0, synthFilter, 0);
AudioConnection pc_sfe(synthFilter, 0, synthEnv, 0);

// ============================================
// Input chain
// ============================================

// Audio input L+R → input mixer
AudioConnection pc_inL(audioInput, 0, inputMixer, 0);
AudioConnection pc_inR(audioInput, 1, inputMixer, 1);

// ============================================
// Master mix (dry path)
// ============================================

// sampleSum + synthEnv + inputMixer → masterMix (ch0=samples, ch1=synth, ch2=input)
AudioConnection pc_sMm(sampleSum, 0, masterMix, 0);
AudioConnection pc_sEm(synthEnv, 0, masterMix, 1);
AudioConnection pc_iMm(inputMixer, 0, masterMix, 2);

// ============================================
// FX send/return
// ============================================

// masterMix → fxSend (copies signal to effects)
AudioConnection pc_mFs(masterMix, 0, fxSend, 0);

// fxSend → all effect inputs
AudioConnection pc_fsR(fxSend, 0, reverb, 0);
AudioConnection pc_fsDL(fxSend, 0, delayL, 0);
AudioConnection pc_fsBC(fxSend, 0, crusher, 0);
AudioConnection pc_fsGR(fxSend, 0, granular, 0);
AudioConnection pc_fsCH(fxSend, 0, chorus, 0);

// Effect outputs → fxReturn mixer (ch0=reverb, ch1=delay, ch2=crusher, ch3=granular)
AudioConnection pc_rFx(reverb, 0, fxReturn, 0);
AudioConnection pc_dFx(delayL, 0, fxReturn, 1);
AudioConnection pc_cFx(crusher, 0, fxReturn, 2);
AudioConnection pc_gFx(granular, 0, fxReturn, 3);

// Chorus + delay feedback into fxReturn2
AudioConnection pc_chFx(chorus, 0, fxReturn2, 0);
// Delay feedback: delay output → fxSend ch1 (feedback path)
AudioConnection pc_dFb(delayL, 0, fxSend, 1);

// ============================================
// Output mixing
// ============================================

// Dry (masterMix) + wet (fxReturn + fxReturn2) → outputMixer
AudioConnection pc_dry(masterMix, 0, outputMixer, 0);
AudioConnection pc_wet1(fxReturn, 0, outputMixer, 1);
AudioConnection pc_wet2(fxReturn2, 0, outputMixer, 2);

// Output mixer → audio output L+R
AudioConnection pc_outL(outputMixer, 0, audioOutput, 0);
AudioConnection pc_outR(outputMixer, 0, audioOutput, 1);

// ============================================
// Analysis + Recording
// ============================================

// Output mixer → peak meters, FFT, recorder
AudioConnection pc_pkL(outputMixer, 0, peakL, 0);
AudioConnection pc_pkR(outputMixer, 0, peakR, 0);
AudioConnection pc_fft(outputMixer, 0, fft, 0);
AudioConnection pc_rec(outputMixer, 0, recorder, 0);

#endif // AUDIO_CONNECTIONS_H
