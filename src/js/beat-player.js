/**
 * Direct Background Beat Player & Web Audio Beat Synchronizer.
 * Uses the embedded <audio id="bgBeatAudio" src="./audio/Final beat.mp3"> element
 * directly on load from 0:00 on every refresh, without routing into AudioContext
 * until AudioContext is actively running so suspended-context silence never occurs.
 */

export function initBackgroundBeat(audioOrPath = './audio/Final beat.mp3') {
  const audio =
    typeof audioOrPath === 'string'
      ? new Audio(encodeURI(audioOrPath))
      : audioOrPath;

  audio.loop = true;
  audio.preload = 'auto';
  audio.muted = false;
  audio.volume = 1.0;
  try {
    audio.currentTime = 0;
  } catch {}

  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let mediaConnected = false;
  let beatBass = 0;

  function connectAnalyserWhenRunning() {
    if (mediaConnected) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) {
        audioCtx = new Ctx();
      }
      if (audioCtx.state !== 'running') return;
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      const src = audioCtx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      mediaConnected = true;
    } catch {
      // Keep native <audio> playback running even if Web Audio graph fails
    }
  }

  async function tryImmediateAutoplay() {
    try {
      await audio.play();
      // Try attaching Web Audio analyser only if AudioContext is already allowed to run
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = audioCtx || new Ctx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        if (audioCtx.state === 'running') {
          connectAnalyserWhenRunning();
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  const removeUnlockListeners = () => {
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };

  async function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtx) {
      audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    connectAnalyserWhenRunning();
    audio.muted = false;
    if (audio.paused) {
      try {
        audio.currentTime = 0;
      } catch {}
      await audio.play().catch(() => {});
    }
    if (!audio.paused && !audio.muted) {
      removeUnlockListeners();
    }
  }

  // Attempt immediate playback from 0:00 on page open / refresh
  tryImmediateAutoplay().then((started) => {
    if (!started || !mediaConnected) {
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  });

  function updateFrame() {
    if (mediaConnected && analyser && !audio.paused && audioCtx?.state === 'running') {
      analyser.getByteFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < 4; i++) bassSum += freqData[i];
      beatBass = bassSum / (4 * 255);
    } else if (!audio.paused) {
      const t = audio.currentTime || performance.now() / 1000;
      beatBass = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.1)), 4) * 0.42;
    } else {
      beatBass *= 0.9;
    }
    return beatBass;
  }

  return { updateFrame };
}
