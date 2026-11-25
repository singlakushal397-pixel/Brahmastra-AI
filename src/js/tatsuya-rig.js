import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/**
 * Dedicated Tatsuya 3D Loader, Material/UV Aligner, Anatomical Rig,
 * Natural Athletic Running Cycle, and Rebel Rush (0.3s Forward Dash) State Machine.
 */

const TATSUYA_TEXTURES = {
  mat_25: './models/tatsuya/hair.png',
  mat_14: './models/tatsuya/body.png',
  mat_2: './models/tatsuya/top.png',
  mat_16: './models/tatsuya/bottom.png',
  mat_34: './models/tatsuya/shoe.png',
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Loads tatsuya.obj with all 5 supplied PNG textures in sRGB color space,
 * builds a 17-bone anatomical Skeleton + SkinnedMeshes, and initializes
 * IDLE / RUN / REBEL_RUSH_PREP / REBEL_RUSH_DASH / REBEL_RUSH_RECOVERY states.
 */
export async function loadTatsuyaRiggedModel(char, texLoader) {
  const loadedTex = {};
  await Promise.all(
    Object.entries(TATSUYA_TEXTURES).map(
      ([matName, url]) =>
        new Promise((resolve) => {
          const t = texLoader.load(url, () => resolve(), undefined, () => resolve());
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          loadedTex[matName] = t;
        })
    )
  );

  const objLoader = new OBJLoader();
  const objRoot = await objLoader.loadAsync(char.modelPath);

  const rawBox = new THREE.Box3().setFromObject(objRoot);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawCenter = rawBox.getCenter(new THREE.Vector3());
  const scaleTarget = char.scaleTarget || 2.05;
  const normScale = scaleTarget / (Math.max(rawSize.x, rawSize.y, rawSize.z) || 1);

  objRoot.scale.setScalar(normScale);
  objRoot.position.set(
    -rawCenter.x * normScale,
    -rawBox.min.y * normScale,
    -rawCenter.z * normScale
  );
  objRoot.updateMatrixWorld(true);

  const jacketGlowMaterials = [];
  const sourceMeshes = [];

  objRoot.traverse((node) => {
    if (!node.isMesh) return;
    const geom = node.geometry.clone();
    geom.applyMatrix4(node.matrixWorld);
    geom.computeVertexNormals();

    const origMats = Array.isArray(node.material) ? node.material : [node.material];
    const mappedMats = origMats.map((m) => {
      const mName = m?.name || '';
      const map = loadedTex[mName] || Object.values(loadedTex)[0];
      const isJacket = mName === 'mat_2';
      const isSkinFace = mName === 'mat_14';
      const isHair = mName === 'mat_25';
      const isPants = mName === 'mat_16';
      const isShoe = mName === 'mat_34';

      const mat = new THREE.MeshStandardMaterial({
        name: mName || node.name,
        map,
        color: 0xffffff,
        roughness: isSkinFace ? 0.50 : isHair ? 0.40 : isShoe ? 0.54 : isPants ? 0.66 : 0.60,
        metalness: isShoe ? 0.16 : isHair ? 0.12 : isJacket ? 0.10 : 0.05,
        side: THREE.DoubleSide,
        alphaTest: isHair ? 0.10 : 0,
        emissive: new THREE.Color(isJacket ? 0xff1e6e : 0x000000),
        emissiveIntensity: 0,
      });

      if (isJacket) jacketGlowMaterials.push(mat);
      return mat;
    });

    sourceMeshes.push({
      name: node.name,
      matNames: origMats.map((m) => m?.name || ''),
      geometry: geom,
      material: mappedMats.length === 1 ? mappedMats[0] : mappedMats,
    });
  });

  const landmarks = measureTatsuyaLandmarks(sourceMeshes);
  const rig = buildTatsuyaSkeleton(landmarks);

  const tatsuyaGroup = new THREE.Group();
  tatsuyaGroup.name = 'tatsuyaRiggedRoot';
  tatsuyaGroup.add(rig.bones.Hips);

  for (const item of sourceMeshes) {
    assignTatsuyaWeights(item.geometry, item.matNames[0] || item.name, rig.boneIndex, landmarks);
    const skinned = new THREE.SkinnedMesh(item.geometry, item.material);
    skinned.name = item.name;
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    skinned.bind(rig.skeleton);
    tatsuyaGroup.add(skinned);
  }

  // Neon City rim accent lights (cyan + magenta) scoped exclusively to Tatsuya
  const neonCyanRim = new THREE.PointLight(0x00e5ff, 1.8, 4.5);
  neonCyanRim.position.set(1.25, 1.45, -0.75);
  const neonMagentaRim = new THREE.PointLight(0xff1e6e, 1.9, 4.5);
  neonMagentaRim.position.set(-1.25, 1.15, -0.75);
  tatsuyaGroup.add(neonCyanRim, neonMagentaRim);

  const restPos = {};
  const restQuat = {};
  for (const [bName, bone] of Object.entries(rig.bones)) {
    restPos[bName] = bone.position.clone();
    restQuat[bName] = bone.quaternion.clone();
  }

  tatsuyaGroup.userData.baseY = 0;
  tatsuyaGroup.userData.baseScale = 1;
  tatsuyaGroup.userData.tatsuyaRig = {
    rig,
    restPos,
    restQuat,
    jacketGlowMaterials,
    neonCyanRim,
    neonMagentaRim,
    isRunning: false,
    runBlend: 0,
    runPhase: 0,
    idlePhase: 0,
    dashState: 'NONE', // NONE | PREP | DASH | RECOVERY
    dashElapsed: 0,
    dashOffsetZ: 0,
  };

  return tatsuyaGroup;
}

function measureTatsuyaLandmarks(sourceMeshes) {
  const pts = [];
  for (const m of sourceMeshes) {
    const mat = m.matNames[0] || m.name;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pts.push({ mat, x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
  }

  const avg = (fn, fallback) => {
    const sub = pts.filter(fn);
    if (!sub.length) return new THREE.Vector3(...fallback);
    let sx = 0, sy = 0, sz = 0;
    for (const p of sub) { sx += p.x; sy += p.y; sz += p.z; }
    return new THREE.Vector3(sx / sub.length, sy / sub.length, sz / sub.length);
  };

  const hipL = avg((p) => p.mat === 'mat_16' && p.y > 0.96 && p.y < 1.10 && p.x > 0.03, [0.10, 1.04, 0]);
  const hipR = avg((p) => p.mat === 'mat_16' && p.y > 0.96 && p.y < 1.10 && p.x < -0.03, [-0.10, 1.04, 0]);
  const kneeL = avg((p) => p.mat === 'mat_16' && Math.abs(p.y - 0.55) < 0.04 && p.x > 0.02, [0.13, 0.55, 0]);
  const kneeR = avg((p) => p.mat === 'mat_16' && Math.abs(p.y - 0.55) < 0.04 && p.x < -0.02, [-0.13, 0.55, 0]);
  const ankleL = avg((p) => p.mat === 'mat_34' && p.y > 0.12 && p.x > 0.02, [0.16, 0.14, 0]);
  const ankleR = avg((p) => p.mat === 'mat_34' && p.y > 0.12 && p.x < -0.02, [-0.16, 0.14, 0]);

  const shoulderL = avg((p) => p.mat === 'mat_2' && p.y > 1.50 && p.y < 1.62 && p.x > 0.18 && p.x < 0.27, [0.21, 1.56, 0]);
  const shoulderR = avg((p) => p.mat === 'mat_2' && p.y > 1.50 && p.y < 1.62 && p.x < -0.18 && p.x > -0.27, [-0.21, 1.56, 0]);
  const elbowL = avg((p) => p.mat === 'mat_14' && Math.abs(p.y - 1.32) < 0.05 && p.x > 0.34, [0.40, 1.32, 0]);
  const elbowR = avg((p) => p.mat === 'mat_14' && Math.abs(p.y - 1.32) < 0.05 && p.x < -0.34, [-0.40, 1.32, 0]);
  const wristL = avg((p) => p.mat === 'mat_14' && p.y > 1.04 && p.y < 1.18 && p.x > 0.50, [0.55, 1.11, 0]);
  const wristR = avg((p) => p.mat === 'mat_14' && p.y > 1.04 && p.y < 1.18 && p.x < -0.50, [-0.55, 1.11, 0]);

  const headCenter = avg((p) => p.mat === 'mat_14' && p.y > 1.76 && p.y < 1.96, [0, 1.85, 0]);

  return {
    hips: new THREE.Vector3(0, 1.06, (hipL.z + hipR.z) * 0.5),
    spine: new THREE.Vector3(0, 1.24, 0),
    chest: new THREE.Vector3(0, 1.48, 0),
    neck: new THREE.Vector3(headCenter.x, 1.70, headCenter.z),
    head: new THREE.Vector3(headCenter.x, 1.82, headCenter.z),
    hairSecondary: new THREE.Vector3(headCenter.x, 1.85, headCenter.z - 0.03),
    hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
  };
}

function buildTatsuyaSkeleton(lm) {
  const bones = {};
  const makeBone = (name, worldPos, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    if (parent) {
      const pw = new THREE.Vector3();
      parent.updateWorldMatrix(true, false);
      parent.getWorldPosition(pw);
      b.position.copy(worldPos).sub(pw);
      parent.add(b);
    } else {
      b.position.copy(worldPos);
    }
    bones[name] = b;
    return b;
  };

  const hips = makeBone('Hips', lm.hips, null);
  const spine = makeBone('Spine', lm.spine, hips);
  const chest = makeBone('Chest', lm.chest, spine);
  const neck = makeBone('Neck', lm.neck, chest);
  const head = makeBone('Head', lm.head, neck);
  makeBone('HairSecondary', lm.hairSecondary, head);

  const upperArmL = makeBone('UpperArm_L', lm.shoulderL, chest);
  const forearmL = makeBone('Forearm_L', lm.elbowL, upperArmL);
  makeBone('Hand_L', lm.wristL, forearmL);

  const upperArmR = makeBone('UpperArm_R', lm.shoulderR, chest);
  const forearmR = makeBone('Forearm_R', lm.elbowR, upperArmR);
  makeBone('Hand_R', lm.wristR, forearmR);

  const thighL = makeBone('Thigh_L', lm.hipL, hips);
  const shinL = makeBone('Shin_L', lm.kneeL, thighL);
  makeBone('Foot_L', lm.ankleL, shinL);

  const thighR = makeBone('Thigh_R', lm.hipR, hips);
  const shinR = makeBone('Shin_R', lm.kneeR, thighR);
  makeBone('Foot_R', lm.ankleR, shinR);

  hips.updateMatrixWorld(true);
  const boneList = Object.values(bones);
  const skeleton = new THREE.Skeleton(boneList);
  const boneIndex = Object.fromEntries(boneList.map((b, i) => [b.name, i]));
  return { bones, boneList, skeleton, boneIndex };
}

function assignTatsuyaWeights(geometry, matName, bi, lm) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const setWeights = (i, entries) => {
    const sorted = entries.filter((e) => e[1] > 0.0001).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = sorted.reduce((acc, e) => acc + e[1], 0);
    if (sum <= 0) {
      sorted.push([bi.Hips, 1]);
      sum = 1;
    }
    for (let k = 0; k < 4; k++) {
      skinIndices[i * 4 + k] = k < sorted.length ? sorted[k][0] : 0;
      skinWeights[i * 4 + k] = k < sorted.length ? sorted[k][1] / sum : 0;
    }
  };

  const projectT = (p, a, b) => {
    const abX = b.x - a.x, abY = b.y - a.y, abZ = b.z - a.z;
    const lenSq = abX * abX + abY * abY + abZ * abZ || 1e-6;
    return clamp01(((p.x - a.x) * abX + (p.y - a.y) * abY + (p.z - a.z) * abZ) / lenSq);
  };

  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));

    if (matName === 'mat_25') {
      // Swept-back highlighted hair: top/front scalp on Head, swept-back ends get secondary bounce
      const tipW = (1 - smoothstep(1.82, 1.94, v.y)) * 0.42;
      setWeights(i, [[bi.Head, 1 - tipW], [bi.HairSecondary, tipW]]);
      continue;
    }

    if (matName === 'mat_34') {
      // Sneakers
      const isLeft = v.x >= 0;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const shinIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const shinW = smoothstep(0.14, 0.24, v.y) * 0.35;
      setWeights(i, [[footIdx, 1 - shinW], [shinIdx, shinW]]);
      continue;
    }

    if (matName === 'mat_16') {
      // Cargo trousers, hanging straps & red knee bandana
      if (v.y >= 1.12) {
        const sp = smoothstep(1.12, 1.24, v.y);
        setWeights(i, [[bi.Hips, 1 - sp], [bi.Spine, sp]]);
        continue;
      }
      const legMix = 1 - smoothstep(0.95, 1.10, v.y);
      const sideBlend = smoothstep(0.01, 0.045, Math.abs(v.x));
      const legW = legMix * sideBlend;
      const isLeft = v.x >= 0;
      const thIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const shIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const kneeY = isLeft ? lm.kneeL.y : lm.kneeR.y;
      const shinRatio = 1 - smoothstep(kneeY - 0.06, kneeY + 0.06, v.y);
      const footRatio = (1 - smoothstep(0.15, 0.24, v.y)) * 0.28;
      setWeights(i, [
        [bi.Hips, 1 - legW],
        [thIdx, legW * (1 - shinRatio)],
        [shIdx, legW * shinRatio * (1 - footRatio)],
        [footIdx, legW * shinRatio * footRatio],
      ]);
      continue;
    }

    // mat_14 (Face, neck, chest/arm/leg tattoos, hands) and mat_2 (Jacket, white inner shirt, necklace/pendant)
    if (v.y >= 1.73 && Math.abs(v.x) < 0.16) {
      const neckBlend = 1 - smoothstep(1.73, 1.79, v.y);
      setWeights(i, [[bi.Head, 1 - neckBlend], [bi.Neck, neckBlend]]);
      continue;
    }

    if (v.y < 0.70) {
      // Exposed lower leg tattoos (left calf/shin)
      const isLeft = v.x >= 0;
      const thIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const shIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const kneeY = isLeft ? lm.kneeL.y : lm.kneeR.y;
      const shinRatio = 1 - smoothstep(kneeY - 0.06, kneeY + 0.06, v.y);
      const footRatio = (1 - smoothstep(0.14, 0.24, v.y)) * 0.25;
      setWeights(i, [
        [thIdx, 1 - shinRatio],
        [shIdx, shinRatio * (1 - footRatio)],
        [footIdx, shinRatio * footRatio],
      ]);
      continue;
    }

    // Check wide-out arms & tattooed forearms/hands BEFORE lower jacket tails!
    if (Math.abs(v.x) >= 0.22 && v.y > 0.88 && v.y < 1.70) {
      const isLeft = v.x >= 0;
      const shoulder = isLeft ? lm.shoulderL : lm.shoulderR;
      const elbow = isLeft ? lm.elbowL : lm.elbowR;
      const wrist = isLeft ? lm.wristL : lm.wristR;
      const upIdx = isLeft ? bi.UpperArm_L : bi.UpperArm_R;
      const foreIdx = isLeft ? bi.Forearm_L : bi.Forearm_R;
      const handIdx = isLeft ? bi.Hand_L : bi.Hand_R;

      const armEntry = smoothstep(0.20, 0.26, Math.abs(v.x));
      const tArm = projectT(v, shoulder, elbow);

      let uW = 1, fW = 0, hW = 0;
      if (Math.abs(v.x) > Math.abs(elbow.x) - 0.04) {
        const eb = smoothstep(Math.abs(elbow.x) - 0.04, Math.abs(elbow.x) + 0.04, Math.abs(v.x));
        uW = 1 - eb;
        fW = eb;
        if (Math.abs(v.x) > Math.abs(wrist.x) - 0.03) {
          const hb = smoothstep(Math.abs(wrist.x) - 0.03, Math.abs(wrist.x) + 0.04, Math.abs(v.x));
          fW *= 1 - hb;
          hW = eb * hb;
        }
      } else {
        const eb = smoothstep(0.75, 1.0, tArm) * 0.2;
        uW = 1 - eb;
        fW = eb;
      }

      setWeights(i, [
        [bi.Chest, 1 - armEntry],
        [upIdx, armEntry * uW],
        [foreIdx, armEntry * fW],
        [handIdx, armEntry * hW],
      ]);
      continue;
    }

    // Lower open jacket panels (y < 1.12, |x| < 0.22)
    if (v.y < 1.12) {
      const isLeft = v.x >= 0;
      const thIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const sideW = smoothstep(0.05, 0.16, Math.abs(v.x)) * 0.22;
      setWeights(i, [[bi.Hips, 1 - sideW], [thIdx, sideW]]);
      continue;
    }

    // Torso, white shirt, necklace & lightning pendant, lapels
    if (v.y >= 1.66) {
      const headW = smoothstep(1.73, 1.79, v.y);
      const neckW = smoothstep(1.66, 1.73, v.y) * (1 - headW);
      setWeights(i, [[bi.Chest, 1 - headW - neckW], [bi.Neck, neckW], [bi.Head, headW]]);
    } else if (v.y >= 1.36) {
      const chW = smoothstep(1.36, 1.50, v.y);
      setWeights(i, [[bi.Spine, 1 - chW], [bi.Chest, chW]]);
    } else {
      const spW = smoothstep(1.12, 1.24, v.y);
      setWeights(i, [[bi.Hips, 1 - spW], [bi.Spine, spW]]);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Triggers the official 0.3s Rebel Rush sequence:
 * PREP (0.16s) -> DASH (0.30s) -> RECOVERY (0.50s) -> return to RUN/IDLE.
 */
export function triggerTatsuyaRebelRush(tatsuyaGroup) {
  const data = tatsuyaGroup?.userData?.tatsuyaRig;
  if (!data) return;
  data.dashState = 'PREP';
  data.dashElapsed = 0;
}

export function setTatsuyaRunning(tatsuyaGroup, running) {
  const data = tatsuyaGroup?.userData?.tatsuyaRig;
  if (!data) return;
  data.isRunning = Boolean(running);
}

/**
 * Updates Tatsuya's animation state machine every frame:
 * IDLE <-> RUN, plus REBEL_RUSH_PREP -> REBEL_RUSH_DASH (0.3s) -> REBEL_RUSH_RECOVERY.
 */
export function updateTatsuyaAnimation(
  tatsuyaGroup,
  dt,
  { isSkillActive = false, isSpeaking = false, beatBass = 0, reducedMotion = false }
) {
  const data = tatsuyaGroup?.userData?.tatsuyaRig;
  if (!data) return;

  const { rig, restPos, restQuat, jacketGlowMaterials, neonCyanRim, neonMagentaRim } = data;
  const bones = rig.bones;
  const motion = reducedMotion ? 0.2 : 1.0;

  // Trigger state machine when Rebel Rush skill begins
  if (isSkillActive && data.dashState === 'NONE') {
    data.dashState = 'PREP';
    data.dashElapsed = 0;
  } else if (!isSkillActive && data.dashState !== 'NONE') {
    data.dashState = 'NONE';
    data.dashElapsed = 0;
  }

  let prepWeight = 0;
  let dashWeight = 0;
  let recoveryWeight = 0;

  if (data.dashState !== 'NONE') {
    data.dashElapsed += dt;
    if (data.dashState === 'PREP') {
      prepWeight = smoothstep(0, 0.16, data.dashElapsed);
      if (data.dashElapsed >= 0.16) {
        data.dashState = 'DASH';
        data.dashElapsed = 0;
      }
    } else if (data.dashState === 'DASH') {
      // Exact 0.30s Rebel Rush forward dash!
      dashWeight = 1.0;
      if (data.dashElapsed >= 0.30) {
        data.dashState = 'RECOVERY';
        data.dashElapsed = 0;
      }
    } else if (data.dashState === 'RECOVERY') {
      const tRec = clamp01(data.dashElapsed / 0.55);
      recoveryWeight = 1.0 - smoothstep(0, 1, tRec);
      if (tRec >= 1) {
        data.dashState = 'NONE';
      }
    }
  }

  const targetRun = data.isRunning ? 1.0 : 0.0;
  data.runBlend += (targetRun - data.runBlend) * Math.min(1, dt * 6.0);
  const rb = data.runBlend * (1 - Math.max(prepWeight, dashWeight));

  data.idlePhase += dt * 2.1;
  if (rb > 0.01) data.runPhase += dt * (9.2 + beatBass * 1.4);

  for (const [bName, bone] of Object.entries(bones)) {
    bone.position.copy(restPos[bName]);
    bone.quaternion.copy(restQuat[bName]);
  }

  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const q = new THREE.Quaternion();
  const addRot = (name, rx, ry, rz) => {
    const b = bones[name];
    if (!b) return;
    euler.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(euler);
    b.quaternion.multiply(q);
  };

  // 1. Relaxed Natural Street-Rebel Idle
  const ip = data.idlePhase;
  const idleFactor = (1 - rb) * (1 - Math.max(prepWeight, dashWeight)) * motion;
  if (idleFactor > 0.005) {
    const breath = Math.sin(ip) * 0.018 * idleFactor;
    const speakNod = isSpeaking ? Math.sin(ip * 3.8) * 0.03 * idleFactor : 0;

    bones.Hips.position.y += Math.sin(ip) * 0.005 * idleFactor;
    addRot('Spine', breath * 0.5, Math.sin(ip * 0.6) * 0.02 * idleFactor, 0);
    addRot('Chest', breath, -Math.sin(ip * 0.6) * 0.015 * idleFactor, 0);
    addRot('Neck', -breath * 0.4 + speakNod * 0.4, 0, 0);
    addRot('Head', speakNod, Math.sin(ip * 0.45) * 0.04 * idleFactor, 0);

    // Drop arms naturally from wide A-pose to relaxed street stance
    addRot('UpperArm_L', 0.06 * idleFactor, 0.14 * idleFactor, -0.58 * idleFactor);
    addRot('UpperArm_R', 0.06 * idleFactor, -0.14 * idleFactor, 0.58 * idleFactor);
    addRot('Forearm_L', 0.08 * idleFactor, 0.34 * idleFactor, 0.06 * idleFactor);
    addRot('Forearm_R', 0.08 * idleFactor, -0.34 * idleFactor, -0.06 * idleFactor);
  }

  // 2. Continuous Realistic Athletic Running Cycle
  if (rb > 0.005) {
    const r = rb * motion;
    const p = data.runPhase;
    const sinL = Math.sin(p);
    const sinR = Math.sin(p + Math.PI);

    bones.Hips.position.y += (Math.abs(Math.sin(p)) * 0.06 + 0.01) * r;
    bones.Hips.position.z += 0.02 * r;
    addRot('Hips', 0.10 * r, Math.cos(p) * 0.09 * r, Math.sin(p) * 0.04 * r);

    addRot('Spine', 0.15 * r, -Math.cos(p) * 0.08 * r, 0);
    addRot('Chest', 0.10 * r, -Math.cos(p) * 0.13 * r, -Math.sin(p) * 0.03 * r);
    addRot('Neck', -0.12 * r, Math.cos(p) * 0.06 * r, 0);
    addRot('Head', -0.08 * r, Math.cos(p) * 0.06 * r, 0);
    addRot('HairSecondary', (0.08 + Math.sin(p * 2 - 0.8) * 0.08) * r, Math.cos(p - 0.6) * 0.09 * r, 0);

    // Legs & knees
    addRot('Thigh_L', (-sinL * 0.76 - 0.06) * r, 0, -0.04 * r);
    addRot('Thigh_R', (-sinR * 0.76 - 0.06) * r, 0, 0.04 * r);

    const kneeL = (0.16 + Math.pow(Math.max(0, Math.sin(p - 0.65)), 1.2) * 1.20 + Math.max(0, -sinL) * 0.25) * r;
    const kneeR = (0.16 + Math.pow(Math.max(0, Math.sin(p + Math.PI - 0.65)), 1.2) * 1.20 + Math.max(0, -sinR) * 0.25) * r;
    addRot('Shin_L', kneeL, 0, 0);
    addRot('Shin_R', kneeR, 0, 0);

    addRot('Foot_L', (-0.18 + Math.cos(p) * 0.28) * r, 0, 0);
    addRot('Foot_R', (-0.18 + Math.cos(p + Math.PI) * 0.28) * r, 0, 0);

    // Arms: drop down from A-pose & bend elbows naturally (Forearm Y/Z flexion toward chest)
    addRot('UpperArm_L', (sinL * 0.66) * r, 0.22 * r, -0.68 * r);
    addRot('UpperArm_R', (sinR * 0.66) * r, -0.22 * r, 0.68 * r);
    addRot('Forearm_L', (-0.95 - Math.max(0, -sinL) * 0.25) * r, 0.75 * r, 0.25 * r);
    addRot('Forearm_R', (-0.95 - Math.max(0, -sinR) * 0.25) * r, -0.75 * r, -0.25 * r);
  }

  // 3. Rebel Rush Dash Sequence (PREP -> 0.3s DASH -> RECOVERY)
  const rushFactor = Math.max(prepWeight * 0.6, dashWeight, recoveryWeight * 0.7) * motion;
  if (rushFactor > 0.005) {
    // Forward dash displacement inside preview viewport (+0.48m surge during 0.3s dash, smooth return)
    const targetZ = dashWeight > 0 ? 0.48 : prepWeight > 0 ? -0.10 : recoveryWeight * 0.22;
    data.dashOffsetZ += (targetZ - data.dashOffsetZ) * Math.min(1, dt * (dashWeight > 0 ? 18 : 6));
    tatsuyaGroup.position.z = data.dashOffsetZ;

    // Deep forward sprint-dash lean (Ref 3 posture!)
    const lean = (prepWeight * 0.28 + dashWeight * 0.44 + recoveryWeight * 0.18) * motion;
    bones.Hips.position.y -= 0.08 * rushFactor;
    addRot('Hips', lean * 0.45, -0.16 * rushFactor, 0);
    addRot('Spine', lean * 0.55, 0.12 * rushFactor, 0);
    addRot('Chest', lean * 0.35, 0.14 * rushFactor, 0);
    addRot('Neck', -lean * 0.75, 0, 0);
    addRot('Head', -lean * 0.45, 0, 0);
    addRot('HairSecondary', 0.24 * rushFactor, 0, 0);

    // Explosive lead knee drive & trailing push-off leg
    addRot('Thigh_L', -0.78 * rushFactor, 0, -0.05 * rushFactor);
    addRot('Shin_L', 1.15 * rushFactor, 0, 0);
    addRot('Thigh_R', 0.58 * rushFactor, 0, 0.05 * rushFactor);
    addRot('Shin_R', 0.42 * rushFactor, 0, 0);

    // Trailing aerodynamic sprint arms
    addRot('UpperArm_L', 0.68 * rushFactor, 0.16 * rushFactor, -0.62 * rushFactor);
    addRot('UpperArm_R', -0.52 * rushFactor, -0.16 * rushFactor, 0.62 * rushFactor);
    addRot('Forearm_L', -0.65 * rushFactor, 0.45 * rushFactor, 0);
    addRot('Forearm_R', -1.05 * rushFactor, -0.55 * rushFactor, 0);
  } else {
    data.dashOffsetZ += (0 - data.dashOffsetZ) * Math.min(1, dt * 6);
    tatsuyaGroup.position.z = data.dashOffsetZ;
  }

  // Subtle jacket rim & neon city lighting pulse during dash
  const glowVal = dashWeight > 0 ? 0.14 : isSkillActive ? 0.05 : 0;
  for (const m of jacketGlowMaterials) m.emissiveIntensity = glowVal;
  neonCyanRim.intensity = isSkillActive ? 3.2 : 1.8;
  neonMagentaRim.intensity = isSkillActive ? 3.6 : 1.9;
}
