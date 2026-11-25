/**
 * Single-Instance Persistent Background Music Controller for Final beat.mp3.
 * - Attempts automatic playback from 0:00 on new website sessions without any UI buttons.
 * - Unlocks smoothly on the first visitor interaction if browser autoplay blocks initial sound.
 * - Feeds real-time beatBass to 3D visuals without interrupting internal navigation.
 */

const PREF_KEY = 'ff_bg_audio_pref_v1';

export function initBackgroundBeat(audioEl, ui = {}) {
  if (window.__embersBgAudioController) {
    return window.__embersBgAudioController;
  }

  const audio =
    typeof audioEl === 'string' ? new Audio(encodeURI(audioEl)) : audioEl;
  const { pillEl, toggleBtnEl, muteBtnEl } = ui;

  audio.loop = true;
  audio.preload = 'metadata';

  const savedPref = loadPref();
  let userPaused = Boolean(savedPref.paused);
  let userMuted = Boolean(savedPref.muted);
  const savedVol = typeof savedPref.volume === 'number' ? savedPref.volume : 1.0;

  audio.muted = userMuted;
  audio.volume = Math.max(0, Math.min(1, savedVol));

  // Fresh session starts cleanly from 0:00
  if (!savedPref.initialized) {
    try {
      audio.currentTime = 0;
    } catch {}
    savePref({ initialized: true, paused: false, muted: false, volume: audio.volume });
  }

  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let mediaConnected = false;
  let beatBass = 0;
  let needsGestureUnlock = false;

  function loadPref() {
    try {
      const raw = sessionStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function savePref(patch) {
    try {
      const next = { ...loadPref(), ...patch };
      sessionStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {}
  }

  function syncUI() {
    if (toggleBtnEl) {
      if (needsGestureUnlock && audio.paused && !userPaused) {
        toggleBtnEl.textContent = '♪ ENABLE SOUND';
        toggleBtnEl.classList.add('needs-unlock');
      } else if (audio.paused) {
        toggleBtnEl.textContent = '▶ PLAY MUSIC';
        toggleBtnEl.classList.remove('needs-unlock');
      } else {
        toggleBtnEl.textContent = '❚❚ MUSIC ON';
        toggleBtnEl.classList.remove('needs-unlock');
      }
    }
    if (muteBtnEl) {
      muteBtnEl.textContent = audio.muted ? '🔇' : '🔊';
      muteBtnEl.setAttribute('aria-pressed', String(audio.muted));
    }
    if (pillEl) {
      pillEl.dataset.playing = String(!audio.paused);
    }
  }

  function connectAnalyserWhenRunning() {
    if (mediaConnected) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !audioCtx || audioCtx.state !== 'running') return;
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      const src = audioCtx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      mediaConnected = true;
    } catch {
      // Keep native <audio> playback working even if Web Audio graph cannot attach
    }
  }

  async function ensureAudioContextRunning() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    connectAnalyserWhenRunning();
  }

  async function startPlayback(fromUserGesture = false) {
    if (userPaused && !fromUserGesture) {
      syncUI();
      return false;
    }
    try {
      if (fromUserGesture) {
        await ensureAudioContextRunning();
      }
      await audio.play();
      needsGestureUnlock = false;
      if (fromUserGesture) {
        connectAnalyserWhenRunning();
      } else {
        // Only attach Web Audio if AudioContext is already permitted to run
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
      }
      syncUI();
      return true;
    } catch {
      needsGestureUnlock = true;
      syncUI();
      return false;
    }
  }

  const removeUnlockListeners = () => {
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
  };

  async function onFirstInteraction(e) {
    if (userPaused) {
      removeUnlockListeners();
      return;
    }
    // If user clicked the pill buttons directly, their own onclick handles it
    if (pillEl && e?.target && pillEl.contains(e.target)) {
      removeUnlockListeners();
      return;
    }
    const ok = await startPlayback(true);
    if (ok) removeUnlockListeners();
  }

  if (toggleBtnEl) {
    toggleBtnEl.onclick = async () => {
      if (audio.paused) {
        userPaused = false;
        savePref({ paused: false });
        await startPlayback(true);
      } else {
        userPaused = true;
        savePref({ paused: true });
        audio.pause();
        syncUI();
      }
    };
  }

  if (muteBtnEl) {
    muteBtnEl.onclick = async () => {
      userMuted = !audio.muted;
      audio.muted = userMuted;
      savePref({ muted: userMuted });
      if (!userMuted && audio.paused && !userPaused) {
        await startPlayback(true);
      } else {
        syncUI();
      }
    };
  }

  audio.addEventListener('error', () => {
    needsGestureUnlock = false;
    if (toggleBtnEl) toggleBtnEl.textContent = '♪ AUDIO UNAVAILABLE';
  });

  // Attempt automatic playback when website opens (unless user explicitly paused this session)
  syncUI();
  if (!userPaused) {
    startPlayback(false).then((started) => {
      if (!started || !mediaConnected) {
        window.addEventListener('pointerdown', onFirstInteraction, { passive: true });
        window.addEventListener('touchstart', onFirstInteraction, { passive: true });
        window.addEventListener('keydown', onFirstInteraction, { passive: true });
      }
    });
  }

  function updateFrame() {
    if (mediaConnected && analyser && !audio.paused && !audio.muted && audioCtx?.state === 'running') {
      analyser.getByteFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < 4; i++) bassSum += freqData[i];
      beatBass = bassSum / (4 * 255);
    } else if (!audio.paused && !audio.muted) {
      const t = audio.currentTime || performance.now() / 1000;
      beatBass = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.1)), 4) * 0.42;
    } else {
      beatBass *= 0.9;
    }
    return beatBass;
  }

  const controller = { updateFrame, audio };
  window.__embersBgAudioController = controller;
  return controller;
}
