/**
 * Modular Character Catalog Loader.
 * Reads /characters/registry.json and each character's 4 isolated config files:
 * character.config.json, personality.config.json, abilities.config.json, model.config.json.
 * Strips private server-only systemInstructions in memory.
 */

export async function loadCharacterCatalog() {
  const regRes = await fetch('./characters/registry.json', { cache: 'no-cache' });
  if (!regRes.ok) {
    throw new Error(`Failed to load character registry (${regRes.status})`);
  }
  const registry = await regRes.json();

  const entries = [...(registry.characters || [])].sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99)
  );

  const loaded = await Promise.all(
    entries.map(async (entry) => {
      const base = `./characters/${entry.id}`;
      const [charCfg, persCfg, abilCfg, modCfg] = await Promise.all([
        fetchJson(`${base}/character.config.json`),
        fetchJson(`${base}/personality.config.json`),
        fetchJson(`${base}/abilities.config.json`),
        fetchJson(`${base}/model.config.json`),
      ]);

      // Never retain internal systemInstructions in frontend state.
      const publicPersonality = {
        personalityTraits: persCfg.personalityTraits || [],
        communicationStyle: persCfg.communicationStyle || '',
        emotionalTone: persCfg.emotionalTone || '',
        signaturePhrases: persCfg.signaturePhrases || [],
        languageSupport: persCfg.languageSupport || ['en'],
      };

      const parsedColor =
        typeof charCfg.color === 'string'
          ? parseInt(charCfg.color, 16)
          : Number(charCfg.color || 0xff6b00);

      return {
        id: charCfg.id,
        visibleInMainGrid: entry.visibleInMainGrid !== false,
        order: entry.order ?? 99,
        name: charCfg.name,
        displayName: charCfg.displayName || charCfg.name,
        role: charCfg.role,
        color: Number.isNaN(parsedColor) ? 0xff6b00 : parsedColor,
        accentHex: charCfg.accentHex || '#FF6B00',
        secondaryHex: charCfg.secondaryHex || '#FFD000',
        bgPos: charCfg.bgPos || '0% 0%',
        status: charCfg.status || 'active',
        tagline: charCfg.tagline || '',
        biography: charCfg.biography || '',
        verifiedVersion: charCfg.verifiedVersion || '',
        stats: charCfg.stats || {},
        suggestedPrompts: charCfg.suggestedPrompts || [],
        skill: abilCfg.activeSkill,
        skillDesc: abilCfg.description,
        abilities: abilCfg,
        personality: publicPersonality,
        modelType: modCfg.modelType || 'placeholder',
        modelPath: modCfg.modelPath || null,
        textures: modCfg.textures || {},
        scaleTarget: modCfg.scaleTarget || 2.05,
        cameraOffset: modCfg.cameraOffset || [0, 1.35, 3.65],
        cameraTarget: modCfg.cameraTarget || [0, 1.0, 0],
        animationProfile: modCfg.animationProfile || 'idle_breathe',
        vfxProfile: modCfg.vfxProfile || 'hologram_placeholder',
        environmentTheme: modCfg.environmentTheme || {
          label: 'Foundry Core',
          primaryHex: '#FF6B00',
          glowHex: '#FFD000',
          bgTop: '#2a1d17',
          bgBottom: '#0d0c0b',
          rimColor: '0xff6b00',
        },
      };
    })
  );

  const byId = new Map(loaded.map((c) => [c.id, c]));
  return {
    characters: loaded,
    mainCharacters: loaded.filter((c) => c.visibleInMainGrid),
    expansionCharacters: loaded.filter((c) => !c.visibleInMainGrid),
    byId,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.json();
}
