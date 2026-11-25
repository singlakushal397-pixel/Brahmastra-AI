/**
 * Background Beat Player & Web Audio Beat Synchronizer.
 * Plays ./audio/Final beat.mp3 from 0:00 on every page open/refresh
 * with no UI buttons or pause controls, driving real-time beatBass
 * synchronization for the 3D Ember Core and 3D characters.
 */

export function initBackgroundBeat(trackSrc = './audio/Final beat.mp3') {
  const audio = new Audio(encodeURI(trackSrc));
  audio.loop = true;
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.currentTime = 0;

  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let mediaConnected = false;
  let beatBass = 0;
  let unlocked = false;

  function ensureAudioGraph() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(audioCtx.destination);
    }
    if (!mediaConnected && audioCtx) {
      const src = audioCtx.createMediaElementSource(audio);
      src.connect(analyser);
      mediaConnected = true;
    }
  }

  async function startUnmutedFromBeginning() {
    ensureAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    audio.muted = false;
    try {
      await audio.play();
      unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  // Attempt immediate unmuted playback from 0:00 on load/refresh
  startUnmutedFromBeginning().then(async (ok) => {
    if (ok) return;
    // If browser autoplay policy requires a user gesture for unmuted sound,
    // start muted silently so timeline begins at 0:00 and unmute on first touch/scroll/key.
    try {
      audio.muted = true;
      await audio.play();
    } catch {}

    const unlock = async () => {
      if (unlocked) return;
      ensureAudioGraph();
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      audio.muted = false;
      if (audio.paused) {
        audio.currentTime = 0;
        await audio.play().catch(() => {});
      }
      unlocked = !audio.paused && !audio.muted;
      if (unlocked) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('wheel', unlock);
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('wheel', unlock, { passive: true });
  });

  function updateFrame() {
    if (analyser && !audio.paused && !audio.muted && audioCtx?.state === 'running') {
      analyser.getByteFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < 4; i++) bassSum += freqData[i];
      beatBass = bassSum / (4 * 255);
    } else if (!audio.paused) {
      // Gentle rhythmic fallback while browser waits for first gesture to unmute
      const t = performance.now() / 1000;
      beatBass = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.1)), 4) * 0.35;
    } else {
      beatBass *= 0.9;
    }
    return beatBass;
  }

  return { updateFrame };
}
