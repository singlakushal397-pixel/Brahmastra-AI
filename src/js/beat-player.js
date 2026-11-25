/**
 * Config-driven Bottom Beat Deck Player.
 * Loads ./audio/beat-player.config.json (never hardcoded), starts from 0:00 on every
 * page open/refresh, renders the 5 circular media transport buttons, and supports
 * true Web Audio reverse playback alongside forward playback, rewind, and fast-forward.
 */

const SVG_ICONS = {
  rewind: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 18V6l-8.5 6L11 18zm.5-6l8.5 6V6l-8.5 6z"/></svg>`,
  reverse: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5v14l-11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  fastforward: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`,
};

export async function initBeatPlayer({
  configUrl = './audio/beat-player.config.json',
  transportEl,
  statusEl,
  fillEl,
  barEl,
  ledEl,
  vizCanvas,
}) {
  const res = await fetch(configUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load beat config (${res.status})`);
  const cfg = await res.json();

  const seekStep = Number(cfg.seekStepSeconds || 10);
  const trackTitle = cfg.trackTitle || 'BEAT';
  const startAt = Number(cfg.startAtSeconds || 0);

  if (cfg.theme?.accent) {
    transportEl.style.setProperty('--beat-accent', cfg.theme.accent);
  }
  if (cfg.theme?.accentBright) {
    transportEl.style.setProperty('--beat-accent-bright', cfg.theme.accentBright);
  }

  // Build transport buttons dynamically from config
  const buttons = {};
  transportEl.innerHTML = '';
  for (const item of cfg.controls || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `beat-tbtn beat-tbtn--${item.size || 'md'} beat-tbtn--${item.variant || 'outline'}`;
    btn.dataset.action = item.action;
    btn.setAttribute('aria-label', item.label || item.action);
    btn.title = item.label || item.action;
    btn.innerHTML = item.action === 'toggle' ? SVG_ICONS.play : (SVG_ICONS[item.action] || '');
    transportEl.appendChild(btn);
    buttons[item.action] = btn;
  }

  const audio = new Audio(encodeURI(cfg.trackSrc));
  audio.loop = cfg.loop !== false;
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.currentTime = startAt;

  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let mediaSrcConnected = false;

  let reversedBuffer = null;
  let reverseDecodePromise = null;
  let reverseSource = null;
  let reverseStartedCtxTime = 0;
  let reverseStartPosSec = 0;

  let isPlaying = false;
  let direction = 1; // 1 = forward, -1 = reverse
  let trackedTime = startAt;
  let beatBass = 0;

  const vizCtx = vizCanvas.getContext('2d');

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(audioCtx.destination);
    }
    if (!mediaSrcConnected) {
      const src = audioCtx.createMediaElementSource(audio);
      src.connect(analyser);
      mediaSrcConnected = true;
    }
  }

  async function ensureReversedBuffer() {
    if (reversedBuffer) return reversedBuffer;
    if (reverseDecodePromise) return reverseDecodePromise;

    reverseDecodePromise = (async () => {
      ensureAudioContext();
      const resp = await fetch(encodeURI(cfg.trackSrc));
      const arrBuf = await resp.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrBuf);
      const rev = audioCtx.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const srcData = decoded.getChannelData(ch);
        const dstData = rev.getChannelData(ch);
        for (let i = 0, j = srcData.length - 1; i < srcData.length; i++, j--) {
          dstData[i] = srcData[j];
        }
      }
      reversedBuffer = rev;
      return rev;
    })();
    return reverseDecodePromise;
  }

  function getDuration() {
    return audio.duration || reversedBuffer?.duration || 0;
  }

  function getCurrentTime() {
    const dur = getDuration();
    if (!dur) return trackedTime;
    if (isPlaying && direction === -1 && audioCtx) {
      const elapsed = audioCtx.currentTime - reverseStartedCtxTime;
      const wrapped = (((reverseStartPosSec - elapsed) % dur) + dur) % dur;
      trackedTime = wrapped;
      return wrapped;
    }
    if (isPlaying && direction === 1) {
      trackedTime = audio.currentTime;
      return audio.currentTime;
    }
    return trackedTime;
  }

  function stopReverseSource() {
    if (reverseSource) {
      try {
        reverseSource.stop();
      } catch {}
      try {
        reverseSource.disconnect();
      } catch {}
      reverseSource = null;
    }
  }

  function syncUI() {
    if (buttons.toggle) {
      buttons.toggle.innerHTML = isPlaying ? SVG_ICONS.pause : SVG_ICONS.play;
      buttons.toggle.classList.toggle('is-playing', isPlaying);
    }
    if (buttons.forward) {
      buttons.forward.classList.toggle('is-active', isPlaying && direction === 1);
    }
    if (buttons.reverse) {
      buttons.reverse.classList.toggle('is-active', isPlaying && direction === -1);
    }
    if (statusEl) {
      statusEl.textContent = isPlaying
        ? (direction === -1 ? `${trackTitle} — REVERSE` : `${trackTitle} — LIVE`)
        : `${trackTitle} — PAUSED`;
    }
  }

  async function playForward(fromSec = null) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    stopReverseSource();
    direction = 1;
    if (fromSec !== null && Number.isFinite(fromSec)) {
      audio.currentTime = Math.max(0, fromSec);
      trackedTime = audio.currentTime;
    } else {
      audio.currentTime = Math.max(0, trackedTime);
    }
    try {
      await audio.play();
      isPlaying = true;
      syncUI();
      return true;
    } catch {
      isPlaying = false;
      syncUI();
      return false;
    }
  }

  async function playReverse(fromSec = null) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    const pos = fromSec !== null ? fromSec : getCurrentTime();
    audio.pause();
    stopReverseSource();

    try {
      const revBuf = await ensureReversedBuffer();
      const dur = revBuf.duration || 1;
      const clampedPos = ((pos % dur) + dur) % dur;
      const revOffset = Math.max(0, Math.min(dur - 0.02, dur - clampedPos));

      const src = audioCtx.createBufferSource();
      src.buffer = revBuf;
      src.loop = cfg.loop !== false;
      src.connect(analyser);
      src.start(0, revOffset);

      reverseSource = src;
      reverseStartedCtxTime = audioCtx.currentTime;
      reverseStartPosSec = clampedPos;
      trackedTime = clampedPos;
      direction = -1;
      isPlaying = true;
      syncUI();
    } catch {
      // Fallback to forward if decode fails
      await playForward(pos);
    }
  }

  function pause() {
    trackedTime = getCurrentTime();
    audio.pause();
    stopReverseSource();
    isPlaying = false;
    syncUI();
  }

  async function seekBy(deltaSeconds) {
    const dur = getDuration();
    if (!dur) return;
    const next = Math.max(0, Math.min(dur - 0.05, getCurrentTime() + deltaSeconds));
    trackedTime = next;
    if (isPlaying) {
      if (direction === -1) await playReverse(next);
      else await playForward(next);
    } else {
      audio.currentTime = next;
      fillEl.style.width = `${(next / dur) * 100}%`;
    }
  }

  // Bind 5 transport buttons
  if (buttons.toggle) {
    buttons.toggle.onclick = () => {
      if (isPlaying) pause();
      else if (direction === -1) playReverse(trackedTime);
      else playForward(trackedTime);
    };
  }
  if (buttons.forward) {
    buttons.forward.onclick = () => playForward(getCurrentTime());
  }
  if (buttons.reverse) {
    buttons.reverse.onclick = () => playReverse(getCurrentTime());
  }
  if (buttons.rewind) {
    buttons.rewind.onclick = () => seekBy(-seekStep);
  }
  if (buttons.fastforward) {
    buttons.fastforward.onclick = () => seekBy(seekStep);
  }

  barEl.onclick = (e) => {
    const dur = getDuration();
    if (!dur) return;
    const r = barEl.getBoundingClientRect();
    const target = ((e.clientX - r.left) / r.width) * dur;
    trackedTime = target;
    if (isPlaying) {
      if (direction === -1) playReverse(target);
      else playForward(target);
    } else {
      audio.currentTime = target;
      fillEl.style.width = `${(target / dur) * 100}%`;
    }
  };

  // Start from 0:00 on every page open / refresh
  syncUI();
  if (cfg.autoplayOnOpen !== false) {
    const started = await playForward(startAt);
    if (!started) {
      if (statusEl) statusEl.textContent = `${trackTitle} — TAP ANYWHERE TO PLAY`;
      const unlockOnce = async () => {
        window.removeEventListener('pointerdown', unlockOnce);
        window.removeEventListener('keydown', unlockOnce);
        window.removeEventListener('touchstart', unlockOnce);
        if (!isPlaying) {
          await playForward(startAt);
        }
      };
      window.addEventListener('pointerdown', unlockOnce, { passive: true });
      window.addEventListener('keydown', unlockOnce, { passive: true });
      window.addEventListener('touchstart', unlockOnce, { passive: true });
    }
  }

  function updateFrame() {
    vizCtx.fillStyle = '#000';
    vizCtx.fillRect(0, 0, vizCanvas.width, vizCanvas.height);

    const dur = getDuration();
    const cur = getCurrentTime();
    if (dur > 0) {
      fillEl.style.width = `${Math.max(0, Math.min(100, (cur / dur) * 100))}%`;
    }

    if (analyser && isPlaying) {
      analyser.getByteFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < 4; i++) bassSum += freqData[i];
      beatBass = bassSum / (4 * 255);
      const bars = 16;
      const bw = vizCanvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const val = freqData[i] / 255;
        const h = Math.max(2, val * vizCanvas.height);
        vizCtx.fillStyle = direction === -1
          ? (i < 6 ? '#7F72FF' : '#FF6B00')
          : (i < 4 ? '#FF6B00' : (i < 10 ? '#FFD000' : '#EDE3DA'));
        vizCtx.fillRect(i * bw + 1, vizCanvas.height - h, bw - 2, h);
      }
      ledEl.style.background = beatBass > 0.55 ? '#6B5CE7' : '#FFD000';
      ledEl.style.transform = `scale(${1 + beatBass * 0.5})`;
    } else {
      beatBass *= 0.9;
      ledEl.style.background = '#333';
      ledEl.style.transform = 'scale(1)';
    }
    return beatBass;
  }

  return { updateFrame };
}
