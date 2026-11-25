import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { AbilityVFXManager } from './ability-vfx.js';
import { loadKellyRiggedModel, updateKellyAnimation } from './kelly-rig.js';
import { loadKRiggedModel, updateKAnimation } from './k-rig.js';
import {
  loadTatsuyaRiggedModel,
  setTatsuyaRunning,
  triggerTatsuyaRebelRush,
  updateTatsuyaAnimation,
} from './tatsuya-rig.js';

/**
 * 3D Character Vault Renderer with:
 * - Adaptive quality (Desktop High / Tablet Medium / Mobile Low)
 * - WebGL capability check + graceful static fallback
 * - Proper SRGB texture mapping for FBX & OBJ models (including Kelly yellow/black)
 * - Natural idle breathing, speaking animation, and character-specific ability motion
 * - Integrated AbilityVFXManager for signature ability demonstrations
 */
export class CharacterVault3D {
  constructor({ canvas, stageEl, loaderEl, loadMsgEl, fallbackEl }) {
    this.canvas = canvas;
    this.stageEl = stageEl;
    this.loaderEl = loaderEl;
    this.loadMsgEl = loadMsgEl;
    this.fallbackEl = fallbackEl;

    this.quality = this._detectQuality();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.webglAvailable = this._initRenderer();

    this.activeModel = null;
    this.activeChar = null;
    this.modelCache = new Map();
    this.texLoader = new THREE.TextureLoader();

    this.autoSpin = true;
    this.wireMode = false;
    this.studioLight = false;
    this.isSpeaking = false;
    this.animClock = 0;
    this.baseModelY = 0;
    this.baseModelScale = 1;
    this.currentCamBase = new THREE.Vector3(0, 1.35, 3.65);
    this.currentTargetBase = new THREE.Vector3(0, 1.0, 0);
  }

  _detectQuality() {
    const w = window.innerWidth;
    if (w <= 680) return 'low';
    if (w <= 1024) return 'medium';
    return 'high';
  }

  _initRenderer() {
    try {
      const gl =
        this.canvas.getContext('webgl2', { antialias: true, alpha: true }) ||
        this.canvas.getContext('webgl', { antialias: true, alpha: true });
      if (!gl) return false;

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context: gl,
        antialias: this.quality !== 'low',
        alpha: true,
        powerPreference: 'high-performance',
      });
      const maxDpr = this.quality === 'low' ? 1.25 : this.quality === 'medium' ? 1.6 : 2.0;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = this.quality !== 'low';
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, 1.4, 0.1, 100);
      this.camera.position.set(0, 1.35, 3.65);

      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 1.9;
      this.controls.maxDistance = 6.2;
      this.controls.maxPolarAngle = Math.PI * 0.52;
      this.controls.target.set(0, 1.0, 0);

      this.keyLight = new THREE.DirectionalLight(0xfff1e0, 2.4);
      this.keyLight.position.set(3, 5, 4);
      this.keyLight.castShadow = this.quality !== 'low';
      this.keyLight.shadow.mapSize.set(1024, 1024);

      this.rimLight = new THREE.DirectionalLight(0xff6b00, 2.1);
      this.rimLight.position.set(-4, 3, -3);

      this.fillLight = new THREE.DirectionalLight(0xd8ecff, 0.75);
      this.fillLight.position.set(0, 2, -4);

      this.ambLight = new THREE.AmbientLight(0xffffff, 0.95);
      this.scene.add(this.keyLight, this.rimLight, this.fillLight, this.ambLight);

      // Subtle shadow-receiving floor plane + pedestal ring + grid
      const shadowPlane = new THREE.Mesh(
        new THREE.CircleGeometry(3.2, 48),
        new THREE.ShadowMaterial({ opacity: 0.42 })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.receiveShadow = true;
      this.scene.add(shadowPlane);

      this.pedRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.032, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xff6b00 })
      );
      this.pedRing.rotation.x = Math.PI / 2;
      this.scene.add(this.pedRing);

      this.gridHelper = new THREE.GridHelper(6, 16, 0xff6b00, 0x332822);
      this.scene.add(this.gridHelper);

      this.vfx = new AbilityVFXManager(this.scene, this.camera, this.quality);
      return true;
    } catch {
      if (this.fallbackEl) this.fallbackEl.hidden = false;
      if (this.loaderEl) this.loaderEl.classList.add('hidden');
      return false;
    }
  }

  resize() {
    if (!this.webglAvailable) return;
    this.quality = this._detectQuality();
    this.vfx?.setQuality(this.quality);
    const box = this.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.renderer.setSize(box.width, box.height);
    this.camera.aspect = box.width / box.height;
    this.camera.updateProjectionMatrix();
  }

  setSpeaking(speaking) {
    this.isSpeaking = Boolean(speaking);
  }

  setAutoSpin(enabled) {
    this.autoSpin = Boolean(enabled);
  }

  setWireframe(enabled) {
    this.wireMode = Boolean(enabled);
    this._applyWireframe();
  }

  setStudioLight(enabled) {
    this.studioLight = Boolean(enabled);
    if (this.ambLight) {
      this.ambLight.intensity = this.studioLight ? 1.85 : 0.95;
    }
  }

  resetCamera() {
    if (!this.webglAvailable) return;
    this.camera.position.copy(this.currentCamBase);
    this.controls.target.copy(this.currentTargetBase);
    this.controls.update();
  }

  async loadCharacter(char) {
    this.activeChar = char;
    this._applyTheme(char);

    if (!this.webglAvailable) {
      this._showFallback(char, 'WebGL unavailable — AI Chat and Dossier remain fully functional.');
      return;
    }

    if (this.fallbackEl) this.fallbackEl.hidden = true;
    this.loaderEl.classList.remove('hidden');
    this.loadMsgEl.textContent =
      char.modelType === 'placeholder'
        ? `INITIALIZING ${char.displayName.toUpperCase()} HOLOGRAM PLACEHOLDER...`
        : `LOADING ${char.name} (${char.modelType.toUpperCase()})...`;

    if (this.activeModel) {
      this.scene.remove(this.activeModel);
      this.activeModel = null;
    }

    const camOffset = char.cameraOffset || [0, 1.35, 3.65];
    const camTarget = char.cameraTarget || [0, 1.0, 0];
    this.currentCamBase.set(camOffset[0], camOffset[1], camOffset[2]);
    this.currentTargetBase.set(camTarget[0], camTarget[1], camTarget[2]);
    this.resetCamera();

    this.vfx.setupForCharacter(char);

    if (this.modelCache.has(char.id)) {
      this.activeModel = this.modelCache.get(char.id);
      this.baseModelY = this.activeModel.userData.baseY || 0;
      this.baseModelScale = this.activeModel.userData.baseScale || 1;
      this.activeModel.position.y = this.baseModelY;
      this.activeModel.rotation.set(0, 0, 0);
      this.scene.add(this.activeModel);
      this._applyWireframe();
      this.loaderEl.classList.add('hidden');
      return;
    }

    try {
      let root;
      if (char.id === 'kelly') {
        root = await loadKellyRiggedModel(char, this.texLoader);
      } else if (char.id === 'k') {
        root = await loadKRiggedModel(char, this.texLoader);
      } else if (char.id === 'tatsuya') {
        root = await loadTatsuyaRiggedModel(char, this.texLoader);
      } else {
        if (char.modelType === 'placeholder' || !char.modelPath) {
          root = this._createPlaceholderModel(char.color || 0xa855f7);
        } else if (char.modelType === 'fbx') {
          root = await this._loadFBX(char);
        } else {
          root = await this._loadOBJ(char);
        }
        this._normalizeModel(root, char.scaleTarget || 2.05);
      }

      this.modelCache.set(char.id, root);
      this.activeModel = root;
      this.baseModelY = root.userData.baseY || 0;
      this.baseModelScale = root.userData.baseScale || 1;
      this.scene.add(this.activeModel);
      this._applyWireframe();
      this.loaderEl.classList.add('hidden');
    } catch (err) {
      console.error('3D Model load error:', err);
      this.loaderEl.classList.add('hidden');
      this._showFallback(char, `Could not load ${char.modelPath || '3D asset'}. AI Chat remains fully operational.`);
    }
  }

  _applyTheme(char) {
    const theme = char.environmentTheme || {};
    if (this.stageEl && theme.bgTop && theme.bgBottom) {
      this.stageEl.style.background = `radial-gradient(circle at 50% 48%, ${theme.bgTop} 0%, ${theme.bgBottom} 76%)`;
    }
    if (this.webglAvailable) {
      this.pedRing.material.color.setHex(char.color);
      this.rimLight.color.setHex(char.color);
    }
  }

  _showFallback(char, reason) {
    if (!this.fallbackEl) return;
    this.fallbackEl.hidden = false;
    const titleEl = this.fallbackEl.querySelector('[data-fallback-name]');
    const msgEl = this.fallbackEl.querySelector('[data-fallback-msg]');
    if (titleEl) titleEl.textContent = char.displayName || char.name;
    if (msgEl) msgEl.textContent = reason;
  }

  async _loadFBX(char) {
    const mgr = new THREE.LoadingManager();
    const texMap = char.textures || {};
    mgr.setURLModifier((url) => {
      const base = url.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toLowerCase();
      return texMap[base] || url;
    });

    const fbxLoader = new FBXLoader(mgr);
    const root = await fbxLoader.loadAsync(char.modelPath);

    root.traverse((ch) => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        mats.forEach((m) => {
          if (!m) return;
          m.side = THREE.DoubleSide;
          if (m.map) {
            m.map.colorSpace = THREE.SRGBColorSpace;
            m.map.needsUpdate = true;
          }
          // Preserve vivid colors on FBX materials (convert overly glossy Phong defaults)
          if (m.shininess !== undefined) {
            m.shininess = 18;
          }
          if (m.name && /hair/i.test(m.name)) {
            m.alphaTest = 0.2;
          }
          m.needsUpdate = true;
        });
      }
    });
    return root;
  }

  async _loadOBJ(char) {
    const objLoader = new OBJLoader();
    const root = await objLoader.loadAsync(char.modelPath);
    const loadedTex = {};

    for (const [mtlName, texUrl] of Object.entries(char.textures || {})) {
      const t = this.texLoader.load(texUrl);
      t.colorSpace = THREE.SRGBColorSpace;
      loadedTex[mtlName] = t;
    }

    root.traverse((ch) => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        const mapped = mats.map((m) => {
          const tex = loadedTex[m?.name] || Object.values(loadedTex)[0];
          return new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.56,
            metalness: 0.14,
            side: THREE.DoubleSide,
          });
        });
        ch.material = mapped.length === 1 ? mapped[0] : mapped;
      }
    });
    return root;
  }

  _createPlaceholderModel(colorHex) {
    const group = new THREE.Group();
    const wireMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      wireframe: true,
      transparent: true,
      opacity: 0.78,
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.9, 12), wireMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 1), wireMat);
    head.position.y = 1.72;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 12), wireMat);
    base.position.y = 0.28;
    group.add(torso, head, base);
    return group;
  }

  _normalizeModel(obj, scaleTarget) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = scaleTarget / maxDim;
    obj.scale.setScalar(scale);
    const baseY = -box.min.y * scale;
    obj.position.set(-center.x * scale, baseY, -center.z * scale);
    obj.userData.baseY = baseY;
    obj.userData.baseScale = scale;
    return obj;
  }

  _applyWireframe() {
    if (!this.activeModel) return;
    this.activeModel.traverse((c) => {
      if (c.isMesh) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => {
          if (m) m.wireframe = this.wireMode;
        });
      }
    });
  }

  setTatsuyaRun(running) {
    if (this.activeChar?.id === 'tatsuya' && this.activeModel) {
      setTatsuyaRunning(this.activeModel, running);
    }
  }

  triggerTatsuyaDash() {
    if (this.activeChar?.id === 'tatsuya' && this.activeModel) {
      triggerTatsuyaRebelRush(this.activeModel);
    }
  }

  renderFrame(dt, beatBass = 0) {
    if (!this.webglAvailable) return;

    this.animClock += dt;
    this.vfx.update(dt, beatBass, this.reducedMotion);

    if (this.activeModel) {
      const t = this.animClock;
      const profile = this.activeChar?.animationProfile || 'idle_breathe';
      const abilityOn = this.vfx.isActive;
      const motion = this.reducedMotion ? 0.15 : 1.0;

      if (this.activeChar?.id === 'kelly' && this.activeModel.userData.kellyRig) {
        updateKellyAnimation(this.activeModel, dt, {
          isRunning: abilityOn,
          isSpeaking: this.isSpeaking,
          beatBass,
          reducedMotion: this.reducedMotion,
        });
        if (this.autoSpin && !this.reducedMotion) {
          this.activeModel.rotation.y += dt * (abilityOn ? 0.25 : 0.45) + beatBass * 0.01;
        }
      } else if (this.activeChar?.id === 'k' && this.activeModel.userData.kRig) {
        updateKAnimation(this.activeModel, dt, {
          isActive: abilityOn,
          kMode: this.vfx.kMode,
          isSpeaking: this.isSpeaking,
          beatBass,
          reducedMotion: this.reducedMotion,
        });
        if (this.autoSpin && !this.reducedMotion) {
          this.activeModel.rotation.y += dt * (abilityOn ? 0.22 : 0.35) + beatBass * 0.008;
        }
      } else if (this.activeChar?.id === 'tatsuya' && this.activeModel.userData.tatsuyaRig) {
        updateTatsuyaAnimation(this.activeModel, dt, {
          isSkillActive: abilityOn,
          isSpeaking: this.isSpeaking,
          beatBass,
          reducedMotion: this.reducedMotion,
        });
        if (this.autoSpin && !this.reducedMotion && !abilityOn) {
          this.activeModel.rotation.y += dt * 0.35 + beatBass * 0.008;
        }
      } else {
        // Subtle breathing + speaking micro-gestures
        const breath = Math.sin(t * 2.1) * 0.008 * motion;
        const speakBob = this.isSpeaking ? Math.sin(t * 7.5) * 0.012 * motion : 0;

        let extraY = 0;
        let leanX = 0;
        let swayZ = Math.sin(t * 1.15) * 0.016 * motion;

        if (profile === 'music_groove') {
          // Alok beat bounce
          const groove = abilityOn ? 0.032 : 0.012;
          extraY = Math.abs(Math.sin(t * 4.6)) * groove * motion + beatBass * 0.035;
          swayZ = Math.sin(t * 2.3) * (abilityOn ? 0.04 : 0.018) * motion;
        } else if (profile === 'crimson_surge' && abilityOn) {
          // Orion slight hover during Crimson Crush
          extraY = (0.1 + Math.sin(t * 3.5) * 0.03) * motion;
        } else if (profile === 'tactical_hover' && abilityOn) {
          extraY = Math.sin(t * 2.6) * 0.025 * motion;
        } else if (profile === 'rebel_dash' && abilityOn) {
          leanX = 0.14 * motion;
          extraY = Math.abs(Math.sin(t * 9)) * 0.035 * motion;
        }

        this.activeModel.position.y = this.baseModelY + breath + speakBob + extraY;
        this.activeModel.rotation.x += (leanX - this.activeModel.rotation.x) * Math.min(1, dt * 6);
        this.activeModel.rotation.z = swayZ;

        if (this.autoSpin && !this.reducedMotion) {
          this.activeModel.rotation.y += dt * 0.45 + beatBass * 0.015;
        }
      }
    }

    if (this.pedRing) {
      this.pedRing.scale.setScalar(1 + beatBass * 0.16);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
