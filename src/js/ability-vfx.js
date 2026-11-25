import * as THREE from 'three';

/**
 * Character-Specific Signature 3D Ability Visual Effects Engine.
 * Supports:
 * - DJ Alok: Drop the Beat (concentric blue rings, rotating arcs, floor disc,
 *   expanding radial waves, rising particles, 3D musical notes, neon light, 10s demo)
 * - Chrono: Time Turner (transparent blue force-field dome, digital geodesic lines, particles)
 * - K: Master of All (dual Jiu-jitsu Mode & Psychology Mode with live switching burst)
 * - Kelly: Deadly Velocity (yellow speed trails, horizontal wind streaks, acceleration chevrons)
 * - Orion: Crimson Crush (dark crimson aura, protective crimson shell, inward HP-drain particles)
 * - Tatsuya: Rebel Rush (double-dash orange/ember shockwaves & ground skid streaks)
 * - Placeholder: Configurable holographic ring
 */
export class AbilityVFXManager {
  constructor(scene, camera, quality = 'high') {
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'abilityVfxRoot';
    this.scene.add(this.rootGroup);

    this.activeProfile = null;
    this.isActive = false;
    this.elapsed = 0;
    this.duration = 10;
    this.fadeFactor = 0;
    this.kMode = 'jiujitsu';
    this.modeBurst = 0;
    this.onStateChange = null;
    this.disposables = [];
    this.updaters = [];
  }

  setQuality(quality) {
    this.quality = quality;
  }

  particleScale() {
    if (this.quality === 'low') return 0.45;
    if (this.quality === 'medium') return 0.72;
    return 1.0;
  }

  clear() {
    this.isActive = false;
    this.elapsed = 0;
    this.fadeFactor = 0;
    this.updaters = [];
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    for (const item of this.disposables) {
      if (item && typeof item.dispose === 'function') {
        item.dispose();
      }
    }
    this.disposables = [];
  }

  track(resource) {
    this.disposables.push(resource);
    return resource;
  }

  setupForCharacter(charConfig) {
    this.clear();
    this.activeProfile = charConfig.vfxProfile;
    this.duration = Number(charConfig.abilities?.durationSeconds || 10);
    this.kMode = 'jiujitsu';

    switch (this.activeProfile) {
      case 'drop_the_beat_blue_aura':
        this._buildAlokDropTheBeat();
        break;
      case 'time_turner_dome':
        this._buildChronoTimeTurner();
        break;
      case 'master_of_all_dual_mode':
        this._buildKMasterOfAll();
        break;
      case 'deadly_velocity_trails':
        this._buildKellyDeadlyVelocity();
        break;
      case 'crimson_crush_orb':
        this._buildOrionCrimsonCrush();
        break;
      case 'rebel_rush_ember_dash':
        this._buildTatsuyaRebelRush();
        break;
      default:
        this._buildPlaceholderHolo(charConfig.color || 0xa855f7);
        break;
    }

    // Start smoothly dormant (subtle ambient presence) until activated
    this.rootGroup.visible = true;
  }

  activate(durationOverride) {
    if (durationOverride) this.duration = durationOverride;
    this.elapsed = 0;
    this.isActive = true;
    this._emitState();
  }

  deactivate() {
    this.isActive = false;
    this._emitState();
  }

  toggle() {
    if (this.isActive) this.deactivate();
    else this.activate();
  }

  setKMode(mode) {
    if (mode !== 'jiujitsu' && mode !== 'psychology') return;
    if (this.kMode === mode) return;
    this.kMode = mode;
    this.modeBurst = 1.0;
    if (!this.isActive) this.activate();
    this._emitState();
  }

  _emitState() {
    if (typeof this.onStateChange === 'function') {
      const remaining = this.isActive ? Math.max(0, this.duration - this.elapsed) : 0;
      this.onStateChange({
        isActive: this.isActive,
        elapsed: this.elapsed,
        remaining,
        duration: this.duration,
        progress: this.isActive ? Math.min(1, this.elapsed / this.duration) : 0,
        kMode: this.kMode,
      });
    }
  }

  update(dt, beatBass = 0, reducedMotion = false) {
    if (this.isActive) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.isActive = false;
        this.elapsed = this.duration;
      }
      this._emitState();
    }

    const targetFade = this.isActive ? 1.0 : 0.14;
    const fadeSpeed = this.isActive ? 5.0 : 2.8;
    this.fadeFactor += (targetFade - this.fadeFactor) * Math.min(1, dt * fadeSpeed);
    if (this.modeBurst > 0) this.modeBurst = Math.max(0, this.modeBurst - dt * 2.2);

    const motionMult = reducedMotion ? 0.25 : 1.0;
    for (const fn of this.updaters) {
      fn(dt * motionMult, this.fadeFactor, beatBass, this.isActive);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. DJ ALOK — DROP THE BEAT BLUE CIRCULAR ENERGY SYSTEM
  // ---------------------------------------------------------------------------
  _buildAlokDropTheBeat() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    // Procedural radial gradient energy surface texture
    const discCanvas = document.createElement('canvas');
    discCanvas.width = 512;
    discCanvas.height = 512;
    const dctx = discCanvas.getContext('2d');
    const grad = dctx.createRadialGradient(256, 256, 28, 256, 256, 252);
    grad.addColorStop(0.0, 'rgba(0, 229, 255, 0.08)');
    grad.addColorStop(0.45, 'rgba(0, 170, 255, 0.22)');
    grad.addColorStop(0.76, 'rgba(0, 212, 255, 0.55)');
    grad.addColorStop(0.92, 'rgba(130, 245, 255, 0.85)');
    grad.addColorStop(1.0, 'rgba(0, 160, 255, 0.0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 512, 512);

    // Equalizer tick lines on floor disc
    dctx.strokeStyle = 'rgba(160, 245, 255, 0.48)';
    dctx.lineWidth = 2;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r1 = 175;
      const r2 = i % 3 === 0 ? 225 : 200;
      dctx.beginPath();
      dctx.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      dctx.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
      dctx.stroke();
    }

    const discTex = this.track(new THREE.CanvasTexture(discCanvas));
    discTex.colorSpace = THREE.SRGBColorSpace;

    // 1. Transparent energy surface + floor projection
    const floorMat = this.track(new THREE.MeshBasicMaterial({
      map: discTex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const floorDisc = new THREE.Mesh(this.track(new THREE.CircleGeometry(1.55, 64)), floorMat);
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.position.y = 0.015;
    group.add(floorDisc);

    // 2. Multiple concentric glowing blue rings
    const innerRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x7ceeff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    const innerRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.78, 0.022, 12, 64)), innerRingMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.03;

    const mainRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x00c8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    }));
    const mainRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.32, 0.032, 14, 72)), mainRingMat);
    mainRing.rotation.x = Math.PI / 2;
    mainRing.position.y = 0.035;

    const haloRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x0088ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
    }));
    const haloRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.52, 0.016, 10, 72)), haloRingMat);
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = 0.025;
    group.add(innerRing, mainRing, haloRing);

    // 3. Rotating outer circular arc segments (counter-rotating)
    const segGroupA = new THREE.Group();
    const segGroupB = new THREE.Group();
    const segMatA = this.track(new THREE.MeshBasicMaterial({
      color: 0x38e8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const segMatB = this.track(new THREE.MeshBasicMaterial({
      color: 0x00a2ff, transparent: true, opacity: 0.78, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));

    for (let i = 0; i < 4; i++) {
      const arcA = new THREE.Mesh(
        this.track(new THREE.RingGeometry(1.38, 1.48, 24, 1, i * (Math.PI / 2) + 0.12, Math.PI / 3)),
        segMatA
      );
      arcA.rotation.x = -Math.PI / 2;
      arcA.position.y = 0.04;
      segGroupA.add(arcA);

      const arcB = new THREE.Mesh(
        this.track(new THREE.RingGeometry(1.06, 1.14, 24, 1, i * (Math.PI / 2) + 0.35, Math.PI / 3.6)),
        segMatB
      );
      arcB.rotation.x = -Math.PI / 2;
      arcB.position.y = 0.045;
      segGroupB.add(arcB);
    }
    group.add(segGroupA, segGroupB);

    // 4. Expanding animated radial shockwaves
    const waves = [];
    for (let i = 0; i < 3; i++) {
      const wMat = this.track(new THREE.MeshBasicMaterial({
        color: 0x00d8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const wMesh = new THREE.Mesh(this.track(new THREE.RingGeometry(0.95, 1.02, 48)), wMat);
      wMesh.rotation.x = -Math.PI / 2;
      wMesh.position.y = 0.028;
      group.add(wMesh);
      waves.push({ mesh: wMesh, mat: wMat, phase: i / 3 });
    }

    // 5. Blue neon floor point light
    const auraLight = new THREE.PointLight(0x00c8ff, 4.5, 6.5);
    auraLight.position.set(0, 0.45, 0);
    group.add(auraLight);

    // 6. Rising music-inspired vertical energy particles
    const count = Math.round(120 * this.particleScale());
    const pPos = new Float32Array(count * 3);
    const pSpeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.75 + Math.random() * 0.78;
      pPos[i * 3] = Math.cos(angle) * r;
      pPos[i * 3 + 1] = Math.random() * 1.9;
      pPos[i * 3 + 2] = Math.sin(angle) * r;
      pSpeed[i] = 0.55 + Math.random() * 0.9;
    }
    const pGeo = this.track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      color: 0x6cebff, size: 0.05, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const particles = new THREE.Points(pGeo, pMat);
    group.add(particles);

    // 7. Small animated musical note sprites (♪, ♫)
    const noteSprites = [];
    const noteChars = ['♪', '♫', '♬'];
    const noteCount = Math.round(10 * this.particleScale());
    const noteTex = this._makeGlyphTexture('♫', '#7ceeff');
    const noteTex2 = this._makeGlyphTexture('♪', '#00b7ff');
    for (let i = 0; i < noteCount; i++) {
      const spMat = this.track(new THREE.SpriteMaterial({
        map: i % 2 === 0 ? noteTex : noteTex2,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const sp = new THREE.Sprite(spMat);
      sp.scale.set(0.18, 0.18, 0.18);
      group.add(sp);
      noteSprites.push({
        sprite: sp,
        mat: spMat,
        angle: (i / noteCount) * Math.PI * 2,
        radius: 0.95 + (i % 3) * 0.22,
        y: (i / noteCount) * 1.8,
        speed: 0.45 + (i % 4) * 0.14,
        label: noteChars[i % noteChars.length],
      });
    }

    let timeAcc = 0;
    this.updaters.push((dt, fade, beatBass, active) => {
      timeAcc += dt;
      const pulse = 1 + Math.sin(timeAcc * 5.2) * 0.035 + beatBass * 0.12;
      const intensity = active ? fade : fade * 0.55;

      floorDisc.rotation.z += dt * 0.35;
      floorDisc.scale.setScalar(pulse * (0.85 + 0.15 * fade));
      floorMat.opacity = 0.72 * intensity;

      innerRingMat.opacity = 0.9 * intensity;
      mainRingMat.opacity = 0.95 * intensity;
      haloRingMat.opacity = 0.55 * intensity;
      mainRing.scale.setScalar(pulse);
      innerRing.scale.setScalar(1 + Math.cos(timeAcc * 4.5) * 0.04);

      segGroupA.rotation.y += dt * (active ? 1.45 : 0.45);
      segGroupB.rotation.y -= dt * (active ? 1.15 : 0.35);
      segMatA.opacity = 0.9 * intensity;
      segMatB.opacity = 0.75 * intensity;

      auraLight.intensity = (active ? 5.5 + beatBass * 4.0 : 1.0) * fade;

      for (const w of waves) {
        w.phase = (w.phase + dt * (active ? 0.65 : 0.22)) % 1;
        const s = 0.45 + w.phase * 1.25;
        w.mesh.scale.setScalar(s);
        w.mat.opacity = (1 - w.phase) * 0.65 * (active ? fade : 0);
      }

      const attr = particles.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        let py = attr.getY(i) + dt * pSpeed[i] * (active ? 1.25 : 0.35);
        if (py > 2.05) py = 0.05;
        attr.setY(i, py);
      }
      attr.needsUpdate = true;
      pMat.opacity = 0.85 * (active ? fade : 0.2);

      for (const n of noteSprites) {
        n.angle += dt * 0.85;
        n.y += dt * n.speed;
        if (n.y > 2.15) n.y = 0.15;
        n.sprite.position.set(
          Math.cos(n.angle) * n.radius,
          n.y,
          Math.sin(n.angle) * n.radius
        );
        const fadeY = Math.sin((n.y / 2.15) * Math.PI);
        n.mat.opacity = fadeY * 0.95 * (active ? fade : 0);
      }
    });
  }

  _makeGlyphTexture(glyph, hexColor) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.shadowColor = hexColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = hexColor;
    ctx.font = 'bold 78px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 64, 66);
    const tex = this.track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // 2. CHRONO — TIME TURNER FUTURISTIC FORCE-FIELD DOME
  // ---------------------------------------------------------------------------
  _buildChronoTimeTurner() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    const domeMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const dome = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(1.42, 32, 22, 0, Math.PI * 2, 0, Math.PI * 0.58)),
      domeMat
    );
    dome.position.y = 0.0;

    const hexMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x4ae6ff,
      wireframe: true,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const hexDome = new THREE.Mesh(this.track(new THREE.IcosahedronGeometry(1.44, 2)), hexMat);
    hexDome.position.y = 0.45;

    const holoRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    }));
    const ringA = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.42, 0.025, 10, 64)), holoRingMat);
    ringA.rotation.x = Math.PI / 2;
    ringA.position.y = 0.04;

    const ringB = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.22, 0.015, 8, 64)), holoRingMat);
    ringB.position.y = 1.05;
    ringB.rotation.x = Math.PI * 0.36;

    const shieldLight = new THREE.PointLight(0x00d4ff, 4.0, 6.0);
    shieldLight.position.set(0, 1.2, 0);

    const pCount = Math.round(90 * this.particleScale());
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48;
      pPos[i * 3] = 1.44 * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = 1.44 * Math.cos(phi);
      pPos[i * 3 + 2] = 1.44 * Math.sin(phi) * Math.sin(theta);
    }
    const pGeo = this.track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      color: 0x80efff, size: 0.045, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const shieldParticles = new THREE.Points(pGeo, pMat);

    group.add(dome, hexDome, ringA, ringB, shieldLight, shieldParticles);

    let t = 0;
    this.updaters.push((dt, fade, _bass, active) => {
      t += dt;
      const expand = active ? Math.min(1, 0.25 + fade * 0.75) : 0.82;
      dome.scale.setScalar(expand * (1 + Math.sin(t * 4) * 0.015));
      hexDome.scale.setScalar(expand);
      hexDome.rotation.y += dt * 0.35;
      ringB.rotation.z += dt * 0.9;
      ringB.rotation.y -= dt * 0.6;
      shieldParticles.rotation.y -= dt * 0.45;

      domeMat.opacity = (active ? 0.24 : 0.03) * fade;
      hexMat.opacity = (active ? 0.42 : 0.09) * fade;
      holoRingMat.opacity = (active ? 0.9 : 0.35) * fade;
      pMat.opacity = (active ? 0.85 : 0.15) * fade;
      shieldLight.intensity = (active ? 4.5 : 0.7) * fade;
    });
  }

  // ---------------------------------------------------------------------------
  // 3. K (CAPTAIN BOOYAH) — MASTER OF ALL (ORANGE-GOLD GROUND AURA + MODES)
  // ---------------------------------------------------------------------------
  _buildKMasterOfAll() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    // Complementary ground-projected orange-gold circular aura (5m visual demo scale)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fctx = floorCanvas.getContext('2d');
    const grad = fctx.createRadialGradient(256, 256, 40, 256, 256, 252);
    grad.addColorStop(0.0, 'rgba(255, 140, 0, 0.04)');
    grad.addColorStop(0.55, 'rgba(255, 145, 0, 0.16)');
    grad.addColorStop(0.82, 'rgba(255, 195, 35, 0.55)');
    grad.addColorStop(0.95, 'rgba(255, 115, 0, 0.25)');
    grad.addColorStop(1.0, 'rgba(255, 90, 0, 0.0)');
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 512, 512);

    const floorTex = this.track(new THREE.CanvasTexture(floorCanvas));
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floorMat = this.track(new THREE.MeshBasicMaterial({
      map: floorTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const floorDisc = new THREE.Mesh(this.track(new THREE.CircleGeometry(1.52, 64)), floorMat);
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.position.y = 0.015;

    const baseRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xff8c00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    const baseRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.32, 0.026, 12, 64)), baseRingMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.03;

    const outerGoldMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffd000, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending,
    }));
    const outerGoldRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.50, 0.014, 10, 64)), outerGoldMat);
    outerGoldRing.rotation.x = Math.PI / 2;
    outerGoldRing.position.y = 0.025;

    const pulseRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffa500, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const pulseRing = new THREE.Mesh(this.track(new THREE.RingGeometry(0.65, 0.75, 48)), pulseRingMat);
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = 0.038;

    // Ground-rising golden-orange particles
    const pCount = Math.round(90 * this.particleScale());
    const pPos = new Float32Array(pCount * 3);
    const pSpeed = new Float32Array(pCount);
    const pAngle = new Float32Array(pCount);
    const pRad = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      pAngle[i] = Math.random() * Math.PI * 2;
      pRad[i] = 0.45 + Math.random() * 1.05;
      pPos[i * 3] = Math.cos(pAngle[i]) * pRad[i];
      pPos[i * 3 + 1] = Math.random() * 1.7;
      pPos[i * 3 + 2] = Math.sin(pAngle[i]) * pRad[i];
      pSpeed[i] = 0.45 + Math.random() * 0.75;
    }
    const pGeo = this.track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      color: 0xffc433, size: 0.046, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const particles = new THREE.Points(pGeo, pMat);

    const kLight = new THREE.PointLight(0xff8c00, 1.5, 3.2);
    kLight.position.set(0, 0.35, 0);
    group.add(floorDisc, baseRing, outerGoldRing, pulseRing, particles, kLight);

    let t = 0;
    const jiuColor = new THREE.Color(0xff8c00);
    const psyColor = new THREE.Color(0xff6200);
    const goldColor = new THREE.Color(0xffd000);

    this.updaters.push((dt, fade, beatBass, active) => {
      t += dt;
      const isJiu = this.kMode === 'jiujitsu';
      const targetColor = isJiu ? jiuColor : psyColor;
      baseRingMat.color.lerp(targetColor, Math.min(1, dt * 6));
      pulseRingMat.color.lerp(isJiu ? goldColor : jiuColor, Math.min(1, dt * 6));
      kLight.color.lerp(targetColor, Math.min(1, dt * 6));

      floorDisc.rotation.z += dt * (isJiu ? 0.45 : -0.30);
      floorMat.opacity = (active ? 0.65 : 0.14) * fade;
      baseRingMat.opacity = (0.90 + this.modeBurst * 0.15) * fade;
      outerGoldMat.opacity = (active ? 0.78 - (isJiu ? 0 : 0.25) : 0.15) * fade;

      const wave = (t * (isJiu ? 0.82 : 0.5)) % 1;
      const waveScale = isJiu ? (0.48 + wave * (1.25 + this.modeBurst * 0.35)) : (1.55 - wave * 1.05);
      pulseRing.scale.setScalar(waveScale);
      pulseRingMat.opacity = Math.sin(wave * Math.PI) * 0.75 * (active ? fade : 0);
      kLight.intensity = (active ? 1.5 + beatBass * 1.0 + this.modeBurst * 1.2 : 0.35) * fade;

      const attr = particles.geometry.attributes.position;
      for (let i = 0; i < pCount; i++) {
        pAngle[i] += dt * (isJiu ? 0.75 : -1.1);
        let py = attr.getY(i) + dt * pSpeed[i] * (isJiu ? 1.15 : 0.65);
        if (py > 1.75) py = 0.05;
        attr.setX(i, Math.cos(pAngle[i]) * pRad[i]);
        attr.setZ(i, Math.sin(pAngle[i]) * pRad[i]);
        attr.setY(i, py);
      }
      attr.needsUpdate = true;
      pMat.opacity = (active ? 0.88 : 0.16) * fade;
    });
  }

  // ---------------------------------------------------------------------------
  // 4. KELLY — DEADLY VELOCITY (YELLOW SPEED TRAILS & SPRINT STREAKS)
  // ---------------------------------------------------------------------------
  _buildKellyDeadlyVelocity() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    const floorRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffd000, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    const floorRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.05, 0.025, 10, 56)), floorRingMat);
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.y = 0.03;
    group.add(floorRing);

    // Horizontal motion streaks rushing past Kelly
    const streakCount = Math.round(28 * this.particleScale());
    const streaks = [];
    const streakGeo = this.track(new THREE.BoxGeometry(0.022, 0.022, 0.65));
    for (let i = 0; i < streakCount; i++) {
      const sMat = this.track(new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : 0xffd000,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      }));
      const mesh = new THREE.Mesh(streakGeo, sMat);
      mesh.position.set(
        (Math.random() - 0.5) * 2.1,
        0.18 + Math.random() * 1.65,
        (Math.random() - 0.5) * 2.6
      );
      group.add(mesh);
      streaks.push({ mesh, mat: sMat, speed: 3.4 + Math.random() * 2.8 });
    }

    // Yellow aura swirl ribbons
    const arcMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffc400, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const speedArc = new THREE.Mesh(this.track(new THREE.RingGeometry(0.95, 1.15, 36, 1, 0, Math.PI * 1.2)), arcMat);
    speedArc.rotation.x = -Math.PI / 2;
    speedArc.position.y = 0.04;
    group.add(speedArc);

    const kLight = new THREE.PointLight(0xffd000, 3.6, 5.5);
    kLight.position.set(0, 1.1, 0.5);
    group.add(kLight);

    let t = 0;
    this.updaters.push((dt, fade, _bass, active) => {
      t += dt;
      speedArc.rotation.z -= dt * (active ? 5.5 : 1.4);
      floorRing.scale.setScalar(1 + Math.sin(t * 7) * 0.04);
      floorRingMat.opacity = 0.9 * fade;
      arcMat.opacity = (active ? 0.85 : 0.25) * fade;
      kLight.intensity = (active ? 4.2 : 0.9) * fade;

      for (const s of streaks) {
        s.mesh.position.z -= dt * s.speed * (active ? 1.5 : 0.35);
        if (s.mesh.position.z < -1.8) s.mesh.position.z = 1.8;
        s.mat.opacity = (active ? 0.85 : 0.12) * fade;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. ORION — CRIMSON CRUSH (CRIMSON SHIELD ORB & INWARD ABSORPTION)
  // ---------------------------------------------------------------------------
  _buildOrionCrimsonCrush() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    const orbMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xff1e3c,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const orbShell = new THREE.Mesh(this.track(new THREE.SphereGeometry(1.18, 28, 22)), orbMat);
    orbShell.position.y = 1.05;

    const ringMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xff2244, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    const baseRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.28, 0.032, 12, 64)), ringMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.03;

    const count = Math.round(100 * this.particleScale());
    const pPos = new Float32Array(count * 3);
    const pAngle = new Float32Array(count);
    const pRadius = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pAngle[i] = Math.random() * Math.PI * 2;
      pRadius[i] = 0.35 + Math.random() * 1.45;
      pPos[i * 3] = Math.cos(pAngle[i]) * pRadius[i];
      pPos[i * 3 + 1] = 0.2 + Math.random() * 1.6;
      pPos[i * 3 + 2] = Math.sin(pAngle[i]) * pRadius[i];
    }
    const pGeo = this.track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      color: 0xff3355, size: 0.055, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const drainParticles = new THREE.Points(pGeo, pMat);

    const cLight = new THREE.PointLight(0xff1e3c, 4.5, 6.0);
    cLight.position.set(0, 1.0, 0);
    group.add(orbShell, baseRing, drainParticles, cLight);

    let t = 0;
    this.updaters.push((dt, fade, _bass, active) => {
      t += dt;
      const pulse = 1 + Math.sin(t * 6.0) * 0.05;
      orbShell.scale.setScalar(active ? pulse : 0.7);
      orbMat.opacity = (active ? 0.28 : 0.03) * fade;
      ringMat.opacity = (active ? 0.95 : 0.35) * fade;
      cLight.intensity = (active ? 5.2 : 0.8) * fade;
      pMat.opacity = (active ? 0.9 : 0.2) * fade;

      const attr = drainParticles.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        pAngle[i] += dt * (active ? 2.4 : 0.6);
        pRadius[i] -= dt * (active ? 0.95 : 0.2);
        if (pRadius[i] < 0.18) pRadius[i] = 1.65;
        attr.setX(i, Math.cos(pAngle[i]) * pRadius[i]);
        attr.setZ(i, Math.sin(pAngle[i]) * pRadius[i]);
        const py = attr.getY(i);
        attr.setY(i, py + (1.05 - py) * dt * (active ? 1.5 : 0.3));
      }
      attr.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------
  // 6. TATSUYA — REBEL RUSH (BRIGHT MAGENTA/RED + CYAN 3D NEON RAYS & TRAILS)
  // ---------------------------------------------------------------------------
  _buildTatsuyaRebelRush() {
    const group = new THREE.Group();
    this.rootGroup.add(group);

    // Ground cyberpunk dash base ring & directional chevron aura
    const ringMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xff1e6e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    const dashRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.08, 0.028, 12, 64)), ringMat);
    dashRing.rotation.x = Math.PI / 2;
    dashRing.position.y = 0.03;

    const cyanRingMat = this.track(new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending,
    }));
    const cyanRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(1.26, 0.014, 10, 64)), cyanRingMat);
    cyanRing.rotation.x = Math.PI / 2;
    cyanRing.position.y = 0.025;

    const dashLight = new THREE.PointLight(0xff1e6e, 3.2, 5.5);
    dashLight.position.set(0, 1.0, -0.4);
    const cyanLight = new THREE.PointLight(0x00e5ff, 2.4, 5.0);
    cyanLight.position.set(0, 1.1, 0.5);
    group.add(dashRing, cyanRing, dashLight, cyanLight);

    // 1. Multi-layered 3D Curved Neon Spline Rays extending behind Tatsuya (-Z)
    const rayConfigs = [
      // Left & right shoulder/torso primary magenta-red neon rays + white-hot core
      { pts: [[-0.26, 1.48, 0.15], [-0.42, 1.38, -0.65], [-0.55, 1.25, -1.75], [-0.62, 1.15, -2.85]], color: 0xff1a66, radius: 0.030 },
      { pts: [[0.26, 1.48, 0.15], [0.42, 1.38, -0.65], [0.55, 1.25, -1.75], [0.62, 1.15, -2.85]], color: 0xff1a66, radius: 0.030 },
      // Mid-waist bright red neon rays
      { pts: [[-0.18, 1.08, 0.20], [-0.30, 1.02, -0.55], [-0.40, 0.96, -1.65], [-0.48, 0.92, -2.75]], color: 0xff2233, radius: 0.026 },
      { pts: [[0.18, 1.08, 0.20], [0.30, 1.02, -0.55], [0.40, 0.96, -1.65], [0.48, 0.92, -2.75]], color: 0xff2233, radius: 0.026 },
      // Cyan & electric-blue secondary sweeping rays
      { pts: [[-0.32, 1.28, 0.10], [-0.52, 1.18, -0.75], [-0.70, 1.05, -1.90], [-0.82, 0.95, -2.95]], color: 0x00e5ff, radius: 0.022 },
      { pts: [[0.32, 1.28, 0.10], [0.52, 1.18, -0.75], [0.70, 1.05, -1.90], [0.82, 0.95, -2.95]], color: 0x00e5ff, radius: 0.022 },
      // Knee & sneaker level fast ground rays
      { pts: [[-0.18, 0.38, 0.18], [-0.26, 0.30, -0.70], [-0.35, 0.24, -1.85], [-0.42, 0.20, -2.90]], color: 0x00a2ff, radius: 0.022 },
      { pts: [[0.18, 0.38, 0.18], [0.26, 0.30, -0.70], [0.35, 0.24, -1.85], [0.42, 0.20, -2.90]], color: 0xff0055, radius: 0.022 },
    ];

    const neonRays = [];
    for (let i = 0; i < rayConfigs.length; i++) {
      const cfg = rayConfigs[i];
      const curve = new THREE.CatmullRomCurve3(cfg.pts.map((p) => new THREE.Vector3(...p)));

      // Outer bright colored neon tube
      const outerGeo = this.track(new THREE.TubeGeometry(curve, 28, cfg.radius, 8, false));
      const outerMat = this.track(new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);

      // Inner white-hot accent core
      const coreGeo = this.track(new THREE.TubeGeometry(curve, 28, cfg.radius * 0.36, 6, false));
      const coreMat = this.track(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);

      group.add(outerMesh, coreMesh);
      neonRays.push({ outerMesh, outerMat, coreMesh, coreMat, phase: i * 0.35 });
    }

    // 2. Fast-moving directional light streaks & glowing fragments
    const streakCount = Math.round(44 * this.particleScale());
    const streaks = [];
    const streakGeo = this.track(new THREE.BoxGeometry(0.024, 0.024, 0.92));
    for (let i = 0; i < streakCount; i++) {
      const color = i % 5 === 0 ? 0xffffff : i % 3 === 0 ? 0x00e5ff : i % 2 === 0 ? 0xff1e6e : 0xff2233;
      const m = this.track(new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      const mesh = new THREE.Mesh(streakGeo, m);
      const side = i % 2 === 0 ? 1 : -1;
      mesh.position.set(
        side * (0.16 + Math.random() * 0.72),
        0.15 + Math.random() * 1.55,
        0.5 - Math.random() * 3.4
      );
      group.add(mesh);
      streaks.push({ mesh, mat: m, speed: 6.5 + Math.random() * 5.0 });
    }

    // 3. Trailing energy sparks
    const pCount = Math.round(90 * this.particleScale());
    const pPos = new Float32Array(pCount * 3);
    const pVel = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 1.4;
      pPos[i * 3 + 1] = 0.1 + Math.random() * 1.75;
      pPos[i * 3 + 2] = 0.4 - Math.random() * 3.2;
      pVel[i] = 4.0 + Math.random() * 4.5;
    }
    const pGeo = this.track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = this.track(new THREE.PointsMaterial({
      color: 0xff55aa,
      size: 0.048,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const sparks = new THREE.Points(pGeo, pMat);
    group.add(sparks);

    let t = 0;
    this.updaters.push((dt, fade, _bass, active) => {
      t += dt;
      // Peak intensity during the 0.3s Rebel Rush dash window (0.14s -> 0.52s), smooth fade-out after
      const dashPulse = active
        ? (this.elapsed < 0.14 ? this.elapsed / 0.14 : this.elapsed < 0.65 ? 1.0 : Math.max(0.18, 1 - (this.elapsed - 0.65) / 0.95))
        : 0;

      ringMat.opacity = (active ? 0.95 : 0.25) * fade;
      cyanRingMat.opacity = (active ? 0.85 * dashPulse + 0.15 : 0.15) * fade;
      dashLight.intensity = (active ? 4.5 * dashPulse + 1.2 : 0.4) * fade;
      cyanLight.intensity = (active ? 3.2 * dashPulse + 0.8 : 0.3) * fade;

      for (const ray of neonRays) {
        const flicker = 0.82 + Math.sin(t * 28 + ray.phase) * 0.18;
        ray.outerMat.opacity = (active ? 0.92 * dashPulse * flicker : 0.0) * fade;
        ray.coreMat.opacity = (active ? 0.96 * dashPulse * flicker : 0.0) * fade;
        const zStretch = active ? 0.65 + dashPulse * 0.65 : 0.4;
        ray.outerMesh.scale.set(1, 1, zStretch);
        ray.coreMesh.scale.set(1, 1, zStretch);
      }

      for (const s of streaks) {
        s.mesh.position.z -= dt * s.speed * (active ? 2.4 * Math.max(0.4, dashPulse) : 0.25);
        if (s.mesh.position.z < -3.0) s.mesh.position.z = 0.6;
        s.mat.opacity = (active ? 0.95 * Math.max(0.25, dashPulse) : 0.08) * fade;
      }

      const attr = sparks.geometry.attributes.position;
      for (let i = 0; i < pCount; i++) {
        let pz = attr.getZ(i) - dt * pVel[i] * (active ? 2.0 : 0.2);
        if (pz < -3.0) pz = 0.5;
        attr.setZ(i, pz);
      }
      attr.needsUpdate = true;
      pMat.opacity = (active ? 0.9 * Math.max(0.2, dashPulse) : 0.0) * fade;
    });
  }

  // ---------------------------------------------------------------------------
  // 7. CONFIGURABLE PLACEHOLDER HOLOGRAM (DIALOGUE / RAZOYA)
  // ---------------------------------------------------------------------------
  _buildPlaceholderHolo(colorHex) {
    const group = new THREE.Group();
    this.rootGroup.add(group);
    const mat = this.track(new THREE.MeshBasicMaterial({
      color: colorHex, wireframe: true, transparent: true, opacity: 0.65,
    }));
    const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.95, 0.025, 8, 48)), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    this.updaters.push((dt, fade) => {
      ring.rotation.z += dt * 0.8;
      mat.opacity = 0.65 * fade;
    });
  }
}
