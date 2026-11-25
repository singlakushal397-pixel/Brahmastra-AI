import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/**
 * Dedicated K (Captain Booyah) 3D Loader, Material/UV Aligner, Anatomical Rig,
 * Waist-Centered Orange-Gold "Master of All" Energy Ring, and Clothing Illumination.
 */

const K_TEXTURES = {
  Male_Lobby_Hair_Sc_Professor: './models/k/male_sc_foodieboy_hair_001_s.png',
  Male_Lobby_Head_Sc_Professor: './models/k/Male_Lobby_Head_Sc_Professor_D.png',
  Male_Lobby_Top_Sc_Professor: './models/k/Male_Top_Sc_Professor_D.png',
  Male_Lobby_Body_Sc_Professor: './models/k/Male_Body_Cos_Professor_D.png',
  Male_Lobby_Bottom_Sc_Professor: './models/k/Male_Bottom_Sc_Professor_D.png',
  Male_Lobby_Shoe_Sc_Professor: './models/k/Male_Shoe_Sc_Professor_D.png',
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Loads k.obj facing +Z, maps all 6 supplied Professor/K PNG textures with PBR settings,
 * builds K's anatomical Skeleton + SkinnedMeshes, and attaches the waist-centered
 * orange-gold Master of All energy ring & hand wisps directly to his skeleton.
 */
export async function loadKRiggedModel(char, texLoader) {
  const loadedTex = {};
  await Promise.all(
    Object.entries(K_TEXTURES).map(
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

  // Rotate -90 deg around Y so K faces straight toward +Z camera
  objRoot.rotation.y = -Math.PI / 2;
  objRoot.updateMatrixWorld(true);

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

  const coatGlowMaterials = [];
  const beltGlowMaterials = [];
  const sourceMeshes = [];

  objRoot.traverse((node) => {
    if (!node.isMesh) return;
    const geom = node.geometry.clone();
    geom.applyMatrix4(node.matrixWorld);
    geom.computeVertexNormals();

    const origMats = Array.isArray(node.material) ? node.material : [node.material];
    const mappedMats = origMats.map((m) => {
      const mName = m?.name || node.name;
      const map = loadedTex[mName] || Object.values(loadedTex)[0];
      const isTop = mName === 'Male_Lobby_Top_Sc_Professor';
      const isBottom = mName === 'Male_Lobby_Bottom_Sc_Professor';
      const isShoe = mName === 'Male_Lobby_Shoe_Sc_Professor';
      const isHair = mName === 'Male_Lobby_Hair_Sc_Professor';
      const isSkinOrFace =
        mName === 'Male_Lobby_Body_Sc_Professor' ||
        mName === 'Male_Lobby_Head_Sc_Professor';

      const mat = new THREE.MeshStandardMaterial({
        name: mName,
        map,
        color: 0xffffff,
        roughness: isSkinOrFace ? 0.52 : isHair ? 0.38 : isShoe ? 0.44 : isBottom ? 0.50 : 0.60,
        metalness: isShoe ? 0.24 : isBottom ? 0.22 : isHair ? 0.12 : isTop ? 0.08 : 0.04,
        side: THREE.DoubleSide,
        alphaTest: isHair ? 0.08 : 0,
        emissive: new THREE.Color(isTop || isBottom ? 0xff7300 : 0x000000),
        emissiveIntensity: 0,
      });

      if (isTop) coatGlowMaterials.push(mat);
      if (isBottom) beltGlowMaterials.push(mat);
      return mat;
    });

    sourceMeshes.push({
      name: node.name,
      geometry: geom,
      material: mappedMats.length === 1 ? mappedMats[0] : mappedMats,
    });
  });

  const landmarks = measureKLandmarks(sourceMeshes);
  const rig = buildKSkeleton(landmarks);

  const kGroup = new THREE.Group();
  kGroup.name = 'kRiggedRoot';
  kGroup.add(rig.bones.Hips);

  for (const item of sourceMeshes) {
    assignKSkinWeights(item.geometry, item.name, rig.boneIndex, landmarks);
    const skinned = new THREE.SkinnedMesh(item.geometry, item.material);
    skinned.name = item.name;
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    skinned.bind(rig.skeleton);
    kGroup.add(skinned);
  }

  // Build waist-centered 3D orange-gold energy ring attached directly to Hips bone
  const waistVfx = buildWaistOrangeRing();
  rig.bones.Hips.add(waistVfx.group);

  // Subtle hand energy wisps attached to Hand_L & Hand_R (Ref 3 inspiration)
  const handWisps = buildHandEnergyWisps();
  rig.bones.Hand_L.add(handWisps.left);
  rig.bones.Hand_R.add(handWisps.right);

  // Rest transforms
  const restPos = {};
  const restQuat = {};
  for (const [bName, bone] of Object.entries(rig.bones)) {
    restPos[bName] = bone.position.clone();
    restQuat[bName] = bone.quaternion.clone();
  }

  kGroup.userData.baseY = 0;
  kGroup.userData.baseScale = 1;
  kGroup.userData.kRig = {
    rig,
    restPos,
    restQuat,
    coatGlowMaterials,
    beltGlowMaterials,
    waistVfx,
    handWisps,
    idlePhase: 0,
    activeBlend: 0,
    energyFade: 0,
    modeBlend: 0, // 0 = Jiu-jitsu, 1 = Psychology
  };

  return kGroup;
}

function measureKLandmarks(sourceMeshes) {
  const pts = [];
  for (const m of sourceMeshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pts.push({ mesh: m.name, x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
  }

  const avg = (fn, fallback) => {
    const sub = pts.filter(fn);
    if (!sub.length) return new THREE.Vector3(...fallback);
    let sx = 0, sy = 0, sz = 0;
    for (const p of sub) { sx += p.x; sy += p.y; sz += p.z; }
    return new THREE.Vector3(sx / sub.length, sy / sub.length, sz / sub.length);
  };

  const hipL = avg((p) => p.mesh === 'Male_Lobby_Bottom_Sc_Professor' && p.y > 0.98 && p.y < 1.12 && p.x > 0.03, [0.10, 1.05, 0]);
  const hipR = avg((p) => p.mesh === 'Male_Lobby_Bottom_Sc_Professor' && p.y > 0.98 && p.y < 1.12 && p.x < -0.03, [-0.10, 1.05, 0]);
  const kneeL = avg((p) => p.mesh === 'Male_Lobby_Bottom_Sc_Professor' && Math.abs(p.y - 0.56) < 0.04 && p.x > 0.02, [0.12, 0.56, 0]);
  const kneeR = avg((p) => p.mesh === 'Male_Lobby_Bottom_Sc_Professor' && Math.abs(p.y - 0.56) < 0.04 && p.x < -0.02, [-0.12, 0.56, 0]);
  const ankleL = avg((p) => p.mesh === 'Male_Lobby_Shoe_Sc_Professor' && Math.abs(p.y - 0.14) < 0.03 && p.x > 0.02, [0.16, 0.14, 0]);
  const ankleR = avg((p) => p.mesh === 'Male_Lobby_Shoe_Sc_Professor' && Math.abs(p.y - 0.14) < 0.03 && p.x < -0.02, [-0.16, 0.14, 0]);

  const shoulderL = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && p.y > 1.50 && p.y < 1.62 && p.x > 0.18 && p.x < 0.28, [0.22, 1.56, -0.01]);
  const shoulderR = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && p.y > 1.50 && p.y < 1.62 && p.x < -0.18 && p.x > -0.28, [-0.22, 1.56, -0.01]);
  const elbowL = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && Math.abs(p.y - 1.38) < 0.05 && p.x > 0.34, [0.40, 1.38, -0.02]);
  const elbowR = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && Math.abs(p.y - 1.38) < 0.05 && p.x < -0.34, [-0.40, 1.38, -0.02]);
  const wristL = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && p.y > 1.14 && p.y < 1.24 && p.x > 0.52, [0.56, 1.19, 0.0]);
  const wristR = avg((p) => p.mesh === 'Male_Lobby_Top_Sc_Professor' && p.y > 1.14 && p.y < 1.24 && p.x < -0.52, [-0.56, 1.19, 0.0]);

  const headCenter = avg((p) => p.mesh === 'Male_Lobby_Head_SC_Professor', [0, 1.88, 0.01]);

  return {
    hips: new THREE.Vector3(0, 1.16, (hipL.z + hipR.z) * 0.5),
    spine: new THREE.Vector3(0, 1.28, 0),
    chest: new THREE.Vector3(0, 1.48, 0),
    neck: new THREE.Vector3(headCenter.x, 1.72, headCenter.z),
    head: new THREE.Vector3(headCenter.x, 1.84, headCenter.z),
    hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
  };
}

function buildKSkeleton(lm) {
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
  makeBone('Head', lm.head, neck);

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

function assignKSkinWeights(geometry, meshName, bi, lm) {
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

    if (meshName === 'Male_Lobby_Head_SC_Professor' || meshName === 'Male_Lobby_Hair_Sc_Professor') {
      const neckBlend = 1 - smoothstep(1.76, 1.81, v.y);
      setWeights(i, [[bi.Head, 1 - neckBlend], [bi.Neck, neckBlend]]);
      continue;
    }

    if (meshName === 'Male_Lobby_Shoe_Sc_Professor') {
      const isLeft = v.x >= 0;
      const footIdx = isLeft ? bi.Foot_L : bi.Foot_R;
      const shinIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const shinW = smoothstep(0.18, 0.42, v.y) * 0.65;
      setWeights(i, [[footIdx, 1 - shinW], [shinIdx, shinW]]);
      continue;
    }

    if (meshName === 'Male_Lobby_Bottom_Sc_Professor') {
      if (v.y >= 1.12) {
        const sp = smoothstep(1.12, 1.24, v.y);
        setWeights(i, [[bi.Hips, 1 - sp], [bi.Spine, sp]]);
        continue;
      }
      const legMix = 1 - smoothstep(0.95, 1.10, v.y);
      const sideBlend = smoothstep(0.01, 0.05, Math.abs(v.x));
      const legW = legMix * sideBlend;
      const isLeft = v.x >= 0;
      const thIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const shIdx = isLeft ? bi.Shin_L : bi.Shin_R;
      const shinRatio = 1 - smoothstep(0.50, 0.62, v.y);
      setWeights(i, [
        [bi.Hips, 1 - legW],
        [thIdx, legW * (1 - shinRatio)],
        [shIdx, legW * shinRatio],
      ]);
      continue;
    }

    // Separate wide-out arms/hands (|x| >= 0.225, y in [0.90, 1.70]) BEFORE coat tail check!
    if (Math.abs(v.x) >= 0.225 && v.y > 0.90 && v.y < 1.70) {
      const isLeft = v.x >= 0;
      const shoulder = isLeft ? lm.shoulderL : lm.shoulderR;
      const elbow = isLeft ? lm.elbowL : lm.elbowR;
      const wrist = isLeft ? lm.wristL : lm.wristR;
      const upIdx = isLeft ? bi.UpperArm_L : bi.UpperArm_R;
      const foreIdx = isLeft ? bi.Forearm_L : bi.Forearm_R;
      const handIdx = isLeft ? bi.Hand_L : bi.Hand_R;

      const armEntry = smoothstep(0.21, 0.27, Math.abs(v.x));
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

    // Lower coat tails (y < 1.10, torso width |x| < 0.225) stay anchored on Hips with subtle thigh follow
    if (v.y < 1.10) {
      const isLeft = v.x >= 0;
      const thIdx = isLeft ? bi.Thigh_L : bi.Thigh_R;
      const sideW = smoothstep(0.04, 0.16, Math.abs(v.x)) * 0.22;
      setWeights(i, [[bi.Hips, 1 - sideW], [thIdx, sideW]]);
      continue;
    }

    // Torso, collar, waist belt, chest
    if (v.y >= 1.66) {
      const headW = smoothstep(1.74, 1.80, v.y);
      const neckW = smoothstep(1.66, 1.73, v.y) * (1 - headW);
      setWeights(i, [[bi.Chest, 1 - headW - neckW], [bi.Neck, neckW], [bi.Head, headW]]);
    } else if (v.y >= 1.38) {
      const chW = smoothstep(1.38, 1.50, v.y);
      setWeights(i, [[bi.Spine, 1 - chW], [bi.Chest, chW]]);
    } else {
      const spW = smoothstep(1.14, 1.26, v.y);
      setWeights(i, [[bi.Hips, 1 - spW], [bi.Spine, spW]]);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

/**
 * Builds the 3D Orange-Gold Circular Energy Ring centered around K's abdomen/waist.
 */
function buildWaistOrangeRing() {
  const group = new THREE.Group();
  group.name = 'kWaistOrangeAura';
  group.position.set(0, 0.0, 0); // Centered right on Hips bone (y = 1.16 waist belt)

  // Procedural radial energy surface texture (translucent orange-gold band + tick segments)
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 118, 256, 256, 252);
  grad.addColorStop(0.0, 'rgba(255, 140, 0, 0.0)');
  grad.addColorStop(0.32, 'rgba(255, 145, 10, 0.20)');
  grad.addColorStop(0.58, 'rgba(255, 185, 30, 0.68)');
  grad.addColorStop(0.76, 'rgba(255, 224, 90, 0.90)');
  grad.addColorStop(0.90, 'rgba(255, 120, 0, 0.42)');
  grad.addColorStop(1.0, 'rgba(255, 90, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine holographic radial energy ticks
  ctx.strokeStyle = 'rgba(255, 232, 140, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = 176;
    const r2 = i % 5 === 0 ? 228 : 204;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
    ctx.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
    ctx.stroke();
  }

  const bandTex = new THREE.CanvasTexture(canvas);
  bandTex.colorSpace = THREE.SRGBColorSpace;

  const bandMat = new THREE.MeshBasicMaterial({
    map: bandTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bandDisc = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.43, 64), bandMat);
  bandDisc.rotation.x = -Math.PI / 2;
  group.add(bandDisc);

  // Main orange-gold circular energy band
  const mainMat = new THREE.MeshBasicMaterial({
    color: 0xff9500,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const mainRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.018, 16, 72), mainMat);
  mainRing.rotation.x = Math.PI / 2;

  // Glowing outer circular ring
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xffd000,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.010, 12, 72), outerMat);
  outerRing.rotation.x = Math.PI / 2;

  // Thinner inner ring
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffaa22,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.008, 12, 64), innerMat);
  innerRing.rotation.x = Math.PI / 2;

  group.add(mainRing, outerRing, innerRing);

  // Rotating segmented outer arcs
  const segGroup = new THREE.Group();
  const segMat = new THREE.MeshBasicMaterial({
    color: 0xffc833,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(0.375, 0.415, 24, 1, i * (Math.PI / 2) + 0.14, Math.PI / 3.2),
      segMat
    );
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = 0.01;
    segGroup.add(arc);
  }
  group.add(segGroup);

  // Radial expanding pulse wave around waist
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xff9900,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.345, 48), pulseMat);
  pulseRing.rotation.x = -Math.PI / 2;
  group.add(pulseRing);

  // Orbiting orange-gold energy particles around abdomen/waist
  const pCount = 72;
  const pPos = new Float32Array(pCount * 3);
  const pAngle = new Float32Array(pCount);
  const pRadius = new Float32Array(pCount);
  const pY = new Float32Array(pCount);
  for (let i = 0; i < pCount; i++) {
    pAngle[i] = Math.random() * Math.PI * 2;
    pRadius[i] = 0.28 + Math.random() * 0.18;
    pY[i] = (Math.random() - 0.5) * 0.22;
    pPos[i * 3] = Math.cos(pAngle[i]) * pRadius[i];
    pPos[i * 3 + 1] = pY[i];
    pPos[i * 3 + 2] = Math.sin(pAngle[i]) * pRadius[i];
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xffc433,
    size: 0.032,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);

  // Soft orange waist illumination onto coat edges, belt & forearms (kept controlled so red coat stays rich)
  const waistLight = new THREE.PointLight(0xff8c00, 0, 1.9);
  waistLight.position.set(0, 0.08, 0.22);
  group.add(waistLight);

  return {
    group,
    bandDisc,
    bandMat,
    mainRing,
    mainMat,
    outerRing,
    outerMat,
    innerRing,
    innerMat,
    segGroup,
    segMat,
    pulseRing,
    pulseMat,
    particles,
    pMat,
    pAngle,
    pRadius,
    pY,
    pCount,
    waistLight,
  };
}

function buildHandEnergyWisps() {
  const makeWisp = () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa11,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 8, 28), mat);
    const light = new THREE.PointLight(0xff8c00, 0, 1.5);
    g.add(ring, light);
    return { group: g, ring, mat, light };
  };
  const left = makeWisp();
  const right = makeWisp();
  return { left: left.group, right: right.group, leftData: left, rightData: right };
}

/**
 * Updates K's posture, Master of All waist orange-gold energy ring, hand wisps,
 * and subtle red-coat illumination every frame.
 */
export function updateKAnimation(
  kGroup,
  dt,
  { isActive, kMode = 'jiujitsu', isSpeaking = false, beatBass = 0, reducedMotion = false }
) {
  const data = kGroup?.userData?.kRig;
  if (!data) return;

  const {
    rig,
    restPos,
    restQuat,
    coatGlowMaterials,
    beltGlowMaterials,
    waistVfx,
    handWisps,
  } = data;
  const bones = rig.bones;
  const motion = reducedMotion ? 0.2 : 1.0;

  data.idlePhase += dt * 1.9;
  data.activeBlend += ((isActive ? 1 : 0) - data.activeBlend) * Math.min(1, dt * 4.5);
  data.energyFade += ((isActive ? 1 : 0.10) - data.energyFade) * Math.min(1, dt * (isActive ? 4.8 : 2.6));
  data.modeBlend += (((kMode === 'psychology') ? 1 : 0) - data.modeBlend) * Math.min(1, dt * 5.0);

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

  // 1. Natural Captain Booyah Poise + Ability Channeling Stance
  const t = data.idlePhase;
  const ab = data.activeBlend;
  const breath = Math.sin(t) * 0.018 * motion;
  const speakNod = isSpeaking ? Math.sin(t * 3.8) * 0.03 * motion : 0;

  bones.Hips.position.y += (Math.sin(t) * 0.004 + ab * 0.008) * motion;
  addRot('Spine', breath * 0.5 - ab * 0.03, Math.sin(t * 0.5) * 0.015 * motion, 0);
  addRot('Chest', breath - ab * 0.04, 0, 0);
  addRot('Neck', -breath * 0.4 + speakNod * 0.4, 0, 0);
  addRot('Head', speakNod + ab * 0.03, Math.sin(t * 0.4) * 0.035 * motion, 0);

  // Relax arms naturally from A-pose in idle; raise outward & slightly forward when channeling Master of All
  const armDrop = 0.44 - ab * 0.34;
  const elbowForward = 0.26 + ab * 0.22;
  addRot('UpperArm_L', -0.04 - ab * 0.14, 0.08 + ab * 0.20, -armDrop);
  addRot('UpperArm_R', -0.04 - ab * 0.14, -0.08 - ab * 0.20, armDrop);
  addRot('Forearm_L', -0.05, elbowForward, 0.05);
  addRot('Forearm_R', -0.05, -elbowForward, -0.05);
  addRot('Hand_L', 0, 0.08, ab * 0.12);
  addRot('Hand_R', 0, -0.08, -ab * 0.12);

  // 2. Waist-Centered Orange-Gold Energy Ring Animation
  const ef = data.energyFade;
  const isPsy = data.modeBlend;
  const speedDir = isPsy > 0.5 ? -1 : 1;
  const baseScale = (isActive ? 0.96 + (1 - isPsy) * 0.08 : 0.78) * (1 + Math.sin(t * 2.8) * 0.025 + beatBass * 0.08);

  waistVfx.group.scale.setScalar(baseScale);
  waistVfx.group.rotation.x = 0.06;
  waistVfx.bandDisc.rotation.z += dt * (isActive ? 0.9 : 0.25) * speedDir;
  waistVfx.segGroup.rotation.y += dt * (isActive ? 1.55 - isPsy * 0.65 : 0.35) * speedDir;

  waistVfx.bandMat.opacity = (isActive ? 0.68 : 0.0) * ef;
  waistVfx.mainMat.opacity = (isActive ? 0.94 : 0.20) * ef;
  waistVfx.outerMat.opacity = (isActive ? 0.85 - isPsy * 0.25 : 0.10) * ef;
  waistVfx.innerMat.opacity = (isActive ? 0.75 + isPsy * 0.20 : 0.08) * ef;
  waistVfx.segMat.opacity = (isActive ? 0.88 : 0.0) * ef;
  waistVfx.pMat.opacity = (isActive ? 0.90 : 0.0) * ef;
  waistVfx.waistLight.intensity = (isActive ? 1.15 + beatBass * 0.8 : 0.15) * ef;

  // Color shift subtly between Jiu-jitsu (vibrant orange-gold) & Psychology (deep amber-gold)
  const jiuColor = new THREE.Color(0xff9500);
  const psyColor = new THREE.Color(0xff6a00);
  waistVfx.mainMat.color.copy(jiuColor).lerp(psyColor, isPsy);

  // Radial waist pulse wave
  const wavePhase = (t * (isPsy > 0.5 ? 0.55 : 0.95)) % 1;
  const waveScale = isPsy > 0.5 ? 1.45 - wavePhase * 0.75 : 0.75 + wavePhase * 0.85; // Jiu-jitsu radiates out, Psychology draws inward
  waistVfx.pulseRing.scale.setScalar(waveScale);
  waistVfx.pulseMat.opacity = isActive ? Math.sin(wavePhase * Math.PI) * 0.65 * ef : 0;

  // Orbiting waist particles
  const pAttr = waistVfx.particles.geometry.attributes.position;
  for (let i = 0; i < waistVfx.pCount; i++) {
    waistVfx.pAngle[i] += dt * (isActive ? 1.65 : 0.4) * speedDir;
    const rOsc = waistVfx.pRadius[i] + Math.sin(t * 2 + i) * 0.025;
    pAttr.setX(i, Math.cos(waistVfx.pAngle[i]) * rOsc);
    pAttr.setZ(i, Math.sin(waistVfx.pAngle[i]) * rOsc);
    pAttr.setY(i, waistVfx.pY[i] + Math.sin(t * 3 + i) * 0.02);
  }
  pAttr.needsUpdate = true;

  // 3. Hand Energy Wisps (subtle golden rings at palms during activation)
  const handGlow = isActive ? 0.72 * ef : 0;
  [handWisps.leftData, handWisps.rightData].forEach((hw, idx) => {
    hw.ring.rotation.x += dt * 2.2 * (idx === 0 ? 1 : -1);
    hw.ring.rotation.y += dt * 1.6;
    hw.mat.opacity = handGlow;
    hw.light.intensity = isActive ? 0.65 * ef : 0;
  });

  // 4. Subtle Orange-Gold Illumination on Red Coat & Belt ONLY (preserve deep red cloth & dark trousers!)
  const coatGlow = isActive ? (0.045 + Math.sin(t * 3.4) * 0.015 + beatBass * 0.025) * ef : 0;
  const beltGlow = isActive ? (0.032 + Math.sin(t * 3.4) * 0.012) * ef : 0;
  for (const m of coatGlowMaterials) m.emissiveIntensity = coatGlow;
  for (const m of beltGlowMaterials) m.emissiveIntensity = beltGlow;
}
