import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * Dedicated Kelly 3D Loader, Material/UV Aligner, Anatomical Skinned Rig,
 * and Realistic Female Running Animation Controller.
 *
 * Uses the exact supplied Kelly PNG texture maps:
 * - bra.png    -> Mesh_0057rip / mat0.001 (Yellow & black jacket + black inner crop top)
 * - face.png   -> Mesh_0053rip / mat0.003 (Face, eyes, red cheek markings)
 * - hairs.png  -> Mesh_0070rip / mat0.002 (Short black bob with red tips)
 * - shoes1.png -> Mesh_0055rip / mat0.005 (Yellow & black sneakers)
 * - body.png   -> Mesh_0054rip / mat0     (Skin, hands, midriff, neck)
 * - pent.png   -> Mesh_0056rip / mat0.004 (Yellow & black track pants + thigh utility pouch)
 */

const KELLY_TEXTURE_BY_MAT = {
  'mat0.001': './models/kelly/bra.png',
  'mat0.003': './models/kelly/face.png',
  'mat0.002': './models/kelly/hairs.png',
  'mat0.005': './models/kelly/shoes1.png',
  'mat0': './models/kelly/body.png',
  'mat0.004': './models/kelly/pent.png',
};

const KELLY_TEXTURE_BY_MESH = {
  Mesh_0057rip: './models/kelly/bra.png',
  Mesh_0053rip: './models/kelly/face.png',
  Mesh_0070rip: './models/kelly/hairs.png',
  Mesh_0055rip: './models/kelly/shoes1.png',
  Mesh_0054rip: './models/kelly/body.png',
  Mesh_0056rip: './models/kelly/pent.png',
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Loads Kelly's FBX, applies her exact PNG textures & physically tuned materials,
 * normalizes scale/floor contact, and binds an anatomical humanoid Skeleton
 * for natural female idle & running animations.
 */
export async function loadKellyRiggedModel(char, texLoader) {
  const loader = new FBXLoader();
  const fbxRoot = await loader.loadAsync(char.modelPath);

  // Load all 6 supplied PNG texture maps in sRGB color space without distorting source files
  const loadedByUrl = {};
  const textureUrls = [...new Set(Object.values(KELLY_TEXTURE_BY_MAT))];
  await Promise.all(
    textureUrls.map(
      (url) =>
        new Promise((resolve) => {
          const tex = texLoader.load(
            url,
            () => resolve(),
            undefined,
            () => resolve()
          );
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          loadedByUrl[url] = tex;
        })
    )
  );

  // Normalize raw FBX geometry bounds to target height (2.05m) standing at y = 0
  const rawBox = new THREE.Box3().setFromObject(fbxRoot);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawCenter = rawBox.getCenter(new THREE.Vector3());
  const scaleTarget = char.scaleTarget || 2.05;
  const normScale = scaleTarget / (Math.max(rawSize.x, rawSize.y, rawSize.z) || 1);
  const offset = new THREE.Vector3(
    -rawCenter.x * normScale,
    -rawBox.min.y * normScale,
    -rawCenter.z * normScale
  );

  fbxRoot.scale.setScalar(normScale);
  fbxRoot.position.copy(offset);
  fbxRoot.updateMatrixWorld(true);

  // Bake normalized world transform into each geometry so SkinnedMesh rest pose is exact
  const sourceMeshes = [];
  fbxRoot.traverse((node) => {
    if (!node.isMesh) return;
    const geom = node.geometry.clone();
    geom.applyMatrix4(node.matrixWorld);
    geom.computeVertexNormals();

    const origMats = Array.isArray(node.material) ? node.material : [node.material];
    const mappedMats = origMats.map((m) => {
      const mName = m?.name || '';
      const texUrl =
        KELLY_TEXTURE_BY_MAT[mName] ||
        KELLY_TEXTURE_BY_MESH[node.name] ||
        char.textures?.bra;
      const map = loadedByUrl[texUrl] || null;
      const isSkin = mName === 'mat0' || node.name === 'Mesh_0054rip';
      const isFace = mName === 'mat0.003' || node.name === 'Mesh_0053rip';
      const isHair = mName === 'mat0.002' || node.name === 'Mesh_0070rip';
      const isShoes = mName === 'mat0.005' || node.name === 'Mesh_0055rip';

      return new THREE.MeshStandardMaterial({
        name: mName || node.name,
        map,
        color: 0xffffff,
        roughness: isSkin || isFace ? 0.52 : isHair ? 0.42 : isShoes ? 0.58 : 0.68,
        metalness: isShoes ? 0.14 : isHair ? 0.12 : 0.06,
        side: THREE.DoubleSide,
        alphaTest: isHair ? 0.12 : 0,
      });
    });

    sourceMeshes.push({
      name: node.name,
      geometry: geom,
      material: mappedMats.length === 1 ? mappedMats[0] : mappedMats,
    });
  });

  // Measure anatomical joint landmarks from normalized vertices
  const landmarks = measureAnatomicalLandmarks(sourceMeshes);
  const rig = buildKellySkeleton(landmarks);

  const kellyGroup = new THREE.Group();
  kellyGroup.name = 'kellyRiggedRoot';
  kellyGroup.add(rig.bones.Hips);

  const skinnedMeshes = [];
  for (const item of sourceMeshes) {
    assignSkinWeights(item.geometry, item.name, rig.boneIndex, landmarks);
    const skinned = new THREE.SkinnedMesh(item.geometry, item.material);
    skinned.name = item.name;
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    skinned.bind(rig.skeleton);
    kellyGroup.add(skinned);
    skinnedMeshes.push(skinned);
  }

  // Subtle red rim accent light inspired by Kelly's Awakened action pose reference
  const redRimAccent = new THREE.PointLight(0xff2a2a, 2.2, 4.2);
  redRimAccent.position.set(-1.1, 1.35, -0.85);
  kellyGroup.add(redRimAccent);

  // Store rest transforms & animation state
  const restPos = {};
  const restQuat = {};
  for (const [bName, bone] of Object.entries(rig.bones)) {
    restPos[bName] = bone.position.clone();
    restQuat[bName] = bone.quaternion.clone();
  }

  kellyGroup.userData.baseY = 0;
  kellyGroup.userData.baseScale = 1;
  kellyGroup.userData.kellyRig = {
    rig,
    restPos,
    restQuat,
    landmarks,
    redRimAccent,
    skinnedMeshes,
    runBlend: 0,
    runPhase: 0,
    idlePhase: 0,
  };

  return kellyGroup;
}

function measureAnatomicalLandmarks(sourceMeshes) {
  const pts = [];
  for (const m of sourceMeshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pts.push({
        mesh: m.name,
        x: pos.getX(i),
        y: pos.getY(i),
        z: pos.getZ(i),
      });
    }
  }

  const avgPoint = (filterFn, fallback) => {
    const subset = pts.filter(filterFn);
    if (!subset.length) return new THREE.Vector3(...fallback);
    let sx = 0, sy = 0, sz = 0;
    for (const p of subset) { sx += p.x; sy += p.y; sz += p.z; }
    return new THREE.Vector3(sx / subset.length, sy / subset.length, sz / subset.length);
  };

  const hipY = 1.03;
  const kneeY = 0.54;
  const ankleY = 0.14;

  // Measure left (+x) and right (-x) leg joint centers from pants & shoes
  const hipL = avgPoint((p) => p.mesh === 'Mesh_0056rip' && p.y > 0.96 && p.y < 1.12 && p.x > 0.03, [0.10, hipY, -0.02]);
  const hipR = avgPoint((p) => p.mesh === 'Mesh_0056rip' && p.y > 0.96 && p.y < 1.12 && p.x < -0.03, [-0.10, hipY, -0.02]);
  const kneeL = avgPoint((p) => p.mesh === 'Mesh_0056rip' && Math.abs(p.y - kneeY) < 0.04 && p.x > 0.01, [0.13, kneeY, -0.02]);
  const kneeR = avgPoint((p) => p.mesh === 'Mesh_0056rip' && Math.abs(p.y - kneeY) < 0.04 && p.x < -0.01, [-0.09, kneeY, -0.02]);
  const ankleL = avgPoint((p) => p.mesh === 'Mesh_0055rip' && p.y > 0.11 && p.x > 0.01, [0.18, ankleY, -0.01]);
  const ankleR = avgPoint((p) => p.mesh === 'Mesh_0055rip' && p.y > 0.11 && p.x < -0.01, [-0.11, ankleY, -0.01]);

  // Measure left (+x) and right (-x) arm joint centers from jacket & hands
  const shoulderL = avgPoint((p) => p.mesh === 'Mesh_0057rip' && p.y > 1.54 && p.y < 1.66 && p.x > 0.13 && p.x < 0.21, [0.16, 1.59, -0.03]);
  const shoulderR = avgPoint((p) => p.mesh === 'Mesh_0057rip' && p.y > 1.54 && p.y < 1.66 && p.x < -0.13 && p.x > -0.21, [-0.16, 1.59, -0.03]);
  const elbowL = avgPoint((p) => p.mesh === 'Mesh_0057rip' && Math.abs(p.y - 1.36) < 0.04 && p.x > 0.20, [0.24, 1.36, -0.04]);
  const elbowR = avgPoint((p) => p.mesh === 'Mesh_0057rip' && Math.abs(p.y - 1.36) < 0.04 && p.x < -0.20, [-0.24, 1.36, -0.04]);
  const wristL = avgPoint((p) => p.mesh === 'Mesh_0057rip' && p.y < 1.21 && p.x > 0.23, [0.29, 1.17, -0.02]);
  const wristR = avgPoint((p) => p.mesh === 'Mesh_0057rip' && p.y < 1.21 && p.x < -0.23, [-0.29, 1.17, -0.02]);

  const headCenter = avgPoint((p) => p.mesh === 'Mesh_0053rip' && p.y > 1.80 && p.y < 1.94, [0, 1.86, -0.06]);

  return {
    hips: new THREE.Vector3((hipL.x + hipR.x) * 0.5, hipY, (hipL.z + hipR.z) * 0.5),
    spine: new THREE.Vector3(0, 1.22, -0.025),
    chest: new THREE.Vector3(0, 1.46, -0.03),
    neck: new THREE.Vector3(headCenter.x, 1.71, headCenter.z),
    head: new THREE.Vector3(headCenter.x, 1.81, headCenter.z),
    hairSecondary: new THREE.Vector3(headCenter.x, 1.83, headCenter.z - 0.02),
    hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
  };
}

function buildKellySkeleton(lm) {
  const bones = {};
  const makeBone = (name, worldPos, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    if (parent) {
      const parentWorld = new THREE.Vector3();
      parent.updateWorldMatrix(true, false);
      parent.getWorldPosition(parentWorld);
      b.position.copy(worldPos).sub(parentWorld);
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

function assignSkinWeights(geometry, meshName, bi, lm) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const armInnerX = (y) => {
    // Tight anatomical gap between Kelly's ribcage/waist (|x|<=0.14) and sleeves (|x|>=0.185)
    const t = clamp01((y - 1.15) / (1.60 - 1.15));
    return 0.178 - t * 0.026;
  };

  const projectT = (p, a, b) => {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const lenSq = abX * abX + abY * abY + abZ * abZ || 1e-6;
    return clamp01(((p.x - a.x) * abX + (p.y - a.y) * abY + (p.z - a.z) * abZ) / lenSq);
  };

  const setVertexWeights = (i, entries) => {
    // Normalize top 4 non-zero weights
    const sorted = entries
      .filter((e) => e[1] > 0.0001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    let sum = sorted.reduce((acc, e) => acc + e[1], 0);
    if (sum <= 0) {
      sorted.push([bi.Hips, 1]);
      sum = 1;
    }
    for (let k = 0; k < 4; k++) {
      if (k < sorted.length) {
        skinIndices[i * 4 + k] = sorted[k][0];
        skinWeights[i * 4 + k] = sorted[k][1] / sum;
      } else {
        skinIndices[i * 4 + k] = 0;
        skinWeights[i * 4 + k] = 0;
      }
    }
  };

  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));

    if (meshName === 'Mesh_0053rip') {
      // Face & upper neck
      const neckBlend = 1 - smoothstep(1.77, 1.81, v.y);
      setVertexWeights(i, [
        [bi.Head, 1 - neckBlend],
        [bi.Neck, neckBlend],
      ]);
      continue;
    }

    if (meshName === 'Mesh_0070rip') {
      // Short black bob with red tips: top scalp locked to Head, lower flared tips get HairSecondary motion
      const tipBlend = (1 - smoothstep(1.77, 1.88, v.y)) * 0.45;
      setVertexWeights(i, [
        [bi.Head, 1 - tipBlend],
        [bi.HairSecondary, tipBlend],
      ]);
      continue;
    }

    if (meshName === 'Mesh_0055rip') {
      // Yellow-and-black sneakers
      const isLeft = v.x >= 0;
      const fIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const sIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const shinBlend = smoothstep(0.14, 0.21, v.y) * 0.25;
      setVertexWeights(i, [
        [fIdx, 1 - shinBlend],
        [sIdx, shinBlend],
      ]);
      continue;
    }

    if (meshName === 'Mesh_0056rip') {
      // Track pants + thigh utility pouch
      if (v.y >= 1.12) {
        const sp = smoothstep(1.12, 1.26, v.y);
        setVertexWeights(i, [
          [bi.Hips, 1 - sp],
          [bi.Spine, sp],
        ]);
        continue;
      }
      const legMix = 1 - smoothstep(0.95, 1.10, v.y);
      const sideBlend = smoothstep(0.008, 0.04, Math.abs(v.x));
      const legWeight = legMix * sideBlend;
      const isLeft = v.x >= 0;
      const thighIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const shinIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const kneeY = isLeft ? lm.kneeL.y : lm.kneeR.y;

      const shinRatio = 1 - smoothstep(kneeY - 0.06, kneeY + 0.06, v.y);
      const footRatio = (1 - smoothstep(0.17, 0.24, v.y)) * 0.35;
      setVertexWeights(i, [
        [bi.Hips, 1 - legWeight],
        [thighIdx, legWeight * (1 - shinRatio)],
        [shinIdx, legWeight * shinRatio * (1 - footRatio)],
        [footIdx, legWeight * shinRatio * footRatio],
      ]);
      continue;
    }

    // Mesh_0057rip (Jacket + crop top) and Mesh_0054rip (Exposed skin + hands + neck)
    if (v.y < 0.88) {
      // Lower exposed ankle skin if any
      const isLeft = v.x >= 0;
      const shinIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const footRatio = 1 - smoothstep(0.12, 0.22, v.y);
      setVertexWeights(i, [
        [shinIdx, 1 - footRatio],
        [footIdx, footRatio],
      ]);
      continue;
    }

    const thresh = armInnerX(v.y);
    const isHandZone = meshName === 'Mesh_0054rip' && v.y < 1.24 && Math.abs(v.x) > 0.21;
    const isArm = isHandZone || Math.abs(v.x) >= thresh;

    if (isArm && v.y < 1.72) {
      const isLeft = v.x >= 0;
      const shoulder = isLeft ? lm.shoulderL : lm.shoulderR;
      const elbow = isLeft ? lm.elbowL : lm.elbowR;
      const wrist = isLeft ? lm.wristL : lm.wristR;
      const upIdx = isLeft ? bi.UpperArm_L : bi.UpperArm_R;
      const foreIdx = isLeft ? bi.Forearm_L : bi.Forearm_R;
      const handIdx = isLeft ? bi.Hand_L : bi.Hand_R;

      const armEntry = isHandZone ? 1 : smoothstep(thresh - 0.01, thresh + 0.016, Math.abs(v.x));
      const tUpper = projectT(v, shoulder, elbow);
      const tFore = projectT(v, elbow, wrist);

      let uW = 1, fW = 0, hW = 0;
      if (v.y < elbow.y + 0.04) {
        const elbowBlend = smoothstep(elbow.y + 0.04, elbow.y - 0.05, v.y);
        uW = 1 - elbowBlend;
        fW = elbowBlend;
        if (v.y < wrist.y + 0.02) {
          const handBlend = smoothstep(wrist.y + 0.02, wrist.y - 0.05, v.y);
          fW *= 1 - handBlend;
          hW = elbowBlend * handBlend;
        }
      } else {
        const elbowBlend = smoothstep(0.75, 1.0, tUpper) * 0.25;
        uW = 1 - elbowBlend;
        fW = elbowBlend;
        void tFore;
      }

      setVertexWeights(i, [
        [bi.Chest, 1 - armEntry],
        [upIdx, armEntry * uW],
        [foreIdx, armEntry * fW],
        [handIdx, armEntry * hW],
      ]);
      continue;
    }

    // Torso, waist, collar, and neck
    if (v.y >= 1.66) {
      const headW = smoothstep(1.74, 1.82, v.y);
      const neckW = smoothstep(1.66, 1.73, v.y) * (1 - headW);
      const chestW = 1 - headW - neckW;
      setVertexWeights(i, [
        [bi.Chest, chestW],
        [bi.Neck, neckW],
        [bi.Head, headW],
      ]);
    } else if (v.y >= 1.38) {
      const chW = smoothstep(1.38, 1.52, v.y);
      setVertexWeights(i, [
        [bi.Spine, 1 - chW],
        [bi.Chest, chW],
      ]);
    } else if (v.y >= 1.15) {
      const spW = smoothstep(1.14, 1.26, v.y);
      setVertexWeights(i, [
        [bi.Hips, 1 - spW],
        [bi.Spine, spW],
      ]);
    } else {
      setVertexWeights(i, [[bi.Hips, 1]]);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Updates Kelly's skeletal animation smoothly every frame.
 * Blends seamlessly between athletic idle and a natural female running stride.
 */
export function updateKellyAnimation(kellyGroup, dt, { isRunning, isSpeaking, beatBass = 0, reducedMotion = false }) {
  const data = kellyGroup?.userData?.kellyRig;
  if (!data) return;

  const { rig, restPos, restQuat, redRimAccent } = data;
  const bones = rig.bones;
  const motion = reducedMotion ? 0.18 : 1.0;

  // Smoothly transition into/out of running state without resetting phase on UI re-renders
  const targetRun = isRunning ? 1.0 : 0.0;
  data.runBlend += (targetRun - data.runBlend) * Math.min(1, dt * 6.0);
  const rb = data.runBlend;

  data.idlePhase += dt * 2.1;
  if (rb > 0.01) {
    data.runPhase += dt * (9.0 + beatBass * 1.6);
  }

  // Reset all bones to exact rest pose before composing blended idle + running rotations
  for (const [bName, bone] of Object.entries(bones)) {
    bone.position.copy(restPos[bName]);
    bone.quaternion.copy(restQuat[bName]);
  }

  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const q = new THREE.Quaternion();
  const addRot = (boneName, rx, ry, rz) => {
    const bone = bones[boneName];
    if (!bone) return;
    euler.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(euler);
    bone.quaternion.multiply(q);
  };

  // 1. Natural Female Athletic Idle (breathing, subtle weight shift, speaking nod)
  const ip = data.idlePhase;
  const idleFactor = (1 - rb) * motion;
  if (idleFactor > 0.005) {
    const breath = Math.sin(ip) * 0.022 * idleFactor;
    const sway = Math.sin(ip * 0.65) * 0.02 * idleFactor;
    const speakNod = isSpeaking ? Math.sin(ip * 3.6) * 0.035 * idleFactor : 0;

    bones.Hips.position.y += Math.sin(ip) * 0.006 * idleFactor;
    addRot('Spine', breath * 0.6, sway, 0);
    addRot('Chest', breath, -sway * 0.7, 0);
    addRot('Neck', -breath * 0.5 + speakNod * 0.5, 0, 0);
    addRot('Head', speakNod, Math.sin(ip * 0.5) * 0.04 * idleFactor, 0);
    addRot('UpperArm_L', 0.04 * idleFactor, 0, -0.04 * idleFactor);
    addRot('UpperArm_R', -0.02 * idleFactor, 0, 0.04 * idleFactor);
    addRot('Forearm_L', -0.18 * idleFactor, 0, 0);
    addRot('Forearm_R', -0.15 * idleFactor, 0, 0);
  }

  // 2. Realistic Female Running Cycle (co-ordinated legs, knees, ankles, arms, torso & hair)
  if (rb > 0.005) {
    const r = rb * motion;
    const p = data.runPhase;
    const sinL = Math.sin(p);
    const sinR = Math.sin(p + Math.PI);

    // Subtle hip vertical bounce (2x stride frequency) & pelvic yaw/roll
    const strideBounce = (Math.abs(Math.sin(p)) * 0.06 + 0.012) * r;
    bones.Hips.position.y += strideBounce;
    bones.Hips.position.z += 0.02 * r;
    addRot('Hips', 0.09 * r, Math.cos(p) * 0.08 * r, Math.sin(p) * 0.04 * r);

    // Forward athletic sprint lean + counter-rotating upper torso
    addRot('Spine', 0.14 * r, -Math.cos(p) * 0.07 * r, 0);
    addRot('Chest', 0.10 * r, -Math.cos(p) * 0.12 * r, -Math.sin(p) * 0.03 * r);

    // Head stabilization looking forward down the track
    addRot('Neck', -0.12 * r, Math.cos(p) * 0.06 * r, 0);
    addRot('Head', -0.08 * r, Math.cos(p) * 0.06 * r, 0);

    // Secondary hair motion lagging behind vertical bounce & yaw
    addRot(
      'HairSecondary',
      (0.08 + Math.sin(p * 2 - 0.85) * 0.08) * r,
      Math.cos(p - 0.6) * 0.09 * r,
      Math.sin(p - 0.5) * 0.06 * r
    );

    // Legs: bring slight A-pose stance inward cleanly toward running track + full stride
    const thighSwingL = (-sinL * 0.76 - 0.06) * r;
    const thighSwingR = (-sinR * 0.76 - 0.06) * r;
    addRot('Thigh_L', thighSwingL, 0, -0.06 * r);
    addRot('Thigh_R', thighSwingR, 0, 0.05 * r);

    // Knee flexion: sharp bend on recovery swing (+X), slight cushion on ground contact
    const kneeBendL = (0.16 + Math.pow(Math.max(0, Math.sin(p - 0.65)), 1.2) * 1.22 + Math.max(0, -sinL) * 0.25) * r;
    const kneeBendR = (0.16 + Math.pow(Math.max(0, Math.sin(p + Math.PI - 0.65)), 1.2) * 1.22 + Math.max(0, -sinR) * 0.25) * r;
    addRot('Shin_L', kneeBendL, 0, 0);
    addRot('Shin_R', kneeBendR, 0, 0);

    // Ankle flexion: level heel-strike & crisp toe push-off
    const ankleL = (-0.18 + Math.cos(p) * 0.28) * r;
    const ankleR = (-0.18 + Math.cos(p + Math.PI) * 0.28) * r;
    addRot('Foot_L', ankleL, 0, 0);
    addRot('Foot_R', ankleR, 0, 0);

    // Arms: bring arms cleanly in from A-pose toward waist + opposite-phase sprint swing
    // Note: Left leg forward (sinL > 0) pairs with Right arm forward (-X rotation)
    const armSwingL = (sinL * 0.72 - 0.05) * r;
    const armSwingR = (sinR * 0.72 - 0.05) * r;
    addRot('UpperArm_L', armSwingL, 0.08 * r, -0.34 * r);
    addRot('UpperArm_R', armSwingR, -0.08 * r, 0.34 * r);

    // Natural athletic elbow bend (~85 deg) pumping with stride
    const elbowL = (-1.38 - Math.max(0, -sinL) * 0.25) * r;
    const elbowR = (-1.38 - Math.max(0, -sinR) * 0.25) * r;
    addRot('Forearm_L', elbowL, 0, 0.14 * r);
    addRot('Forearm_R', elbowR, 0, -0.14 * r);

    // Relaxed runner's hands
    addRot('Hand_L', 0, 0, 0.12 * r);
    addRot('Hand_R', 0, 0, -0.12 * r);
  }

  // Keep feet aligned at floor plane y >= 0 during running stride
  bones.Hips.updateMatrixWorld(true);

  if (redRimAccent) {
    redRimAccent.intensity = isRunning ? 3.4 : 1.6;
  }
}
