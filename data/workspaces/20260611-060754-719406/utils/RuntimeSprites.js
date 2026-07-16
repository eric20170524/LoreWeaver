import imagegenManifest from '../assets/imagegen/manifest.js';

const ATLAS_TEXTURE_KEY = 'imagegen_combat_atlas';

const NODE_1_3_EXPECTED_TEXTURES = {
    node1: [
        'shihao_young_runtime',
        'enemy_wild_rhino',
        'enemy_green_scaled_eagle',
        'enemy_rock_golem',
        'enemy_qiongqi_cub',
        'skill_fist_projectile',
        'pickup_blood_essence',
        'vfx_effect_frame'
    ],
    node2: [
        'shihao_young_runtime',
        'enemy_bandit_cultivator',
        'enemy_burrow_wyrm',
        'enemy_sky_predator',
        'enemy_rock_golem',
        'enemy_ancient_beast_king',
        'chest_gold',
        'skill_fist_projectile',
        'pickup_blood_essence',
        'vfx_effect_frame'
    ],
    node3: [
        'shihao_young_runtime',
        'enemy_human_genius',
        'enemy_genius_beast',
        'enemy_shi_yi_projection',
        'enemy_huo_linger_projection',
        'enemy_shi_yi_phantom',
        'boss_projectile',
        'skill_fist_projectile',
        'pickup_blood_essence',
        'vfx_effect_frame'
    ]
};

const runtimeArtStatus = {
    status: 'idle',
    manifestPath: 'assets/imagegen/manifest.json',
    atlasPath: imagegenManifest.atlasImage,
    atlasTextureKey: ATLAS_TEXTURE_KEY,
    atlasLoaded: false,
    generationStatus: imagegenManifest.generationStatus || 'unknown',
    provenancePath: imagegenManifest.provenancePath || null,
    sourceImage: imagegenManifest.sourceImage || null,
    transparentSourceImage: imagegenManifest.transparentSourceImage || null,
    expectedCount: Object.keys(imagegenManifest.frames || {}).length,
    loadedCount: 0,
    loadedKeys: [],
    fallbackKeys: [],
    missingKeys: [],
    frameKeys: Object.keys(imagegenManifest.frames || {}),
    nodeExpectedTextureKeys: getExpectedNodeTextureKeys(),
    nodeCoverage: {},
    gapSummary: {}
};

function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
}

function cloneStatus(value) {
    return JSON.parse(JSON.stringify(value));
}

function getExpectedNodeTextureKeys() {
    return unique(Object.values(NODE_1_3_EXPECTED_TEXTURES).flat());
}

function getNodeCoverage() {
    const frameKeys = new Set(runtimeArtStatus.frameKeys);
    const loadedKeys = new Set(runtimeArtStatus.loadedKeys);
    const fallbackKeys = new Set(runtimeArtStatus.fallbackKeys);
    const missingKeys = new Set(runtimeArtStatus.missingKeys);

    return Object.fromEntries(Object.entries(NODE_1_3_EXPECTED_TEXTURES).map(([nodeKey, expectedKeys]) => {
        const atlasFrameKeys = expectedKeys.filter(key => frameKeys.has(key));
        const loadedAtlasKeys = expectedKeys.filter(key => loadedKeys.has(key));
        const proceduralFallbackKeys = expectedKeys.filter(key => fallbackKeys.has(key));
        const missingAtlasKeys = expectedKeys.filter(key => !frameKeys.has(key));
        const unresolvedKeys = expectedKeys.filter(key => missingKeys.has(key) && !fallbackKeys.has(key) && !loadedKeys.has(key));

        return [nodeKey, {
            expectedKeys,
            atlasFrameKeys,
            loadedAtlasKeys,
            proceduralFallbackKeys,
            missingAtlasKeys,
            unresolvedKeys,
            atlasCoveragePct: Math.round((atlasFrameKeys.length / expectedKeys.length) * 100),
            runtimeResolvedPct: Math.round(((loadedAtlasKeys.length + proceduralFallbackKeys.length) / expectedKeys.length) * 100)
        }];
    }));
}

function getGapSummary() {
    const expectedKeys = runtimeArtStatus.nodeExpectedTextureKeys;
    const frameKeys = new Set(runtimeArtStatus.frameKeys);
    const fallbackKeys = new Set(runtimeArtStatus.fallbackKeys);
    const loadedKeys = new Set(runtimeArtStatus.loadedKeys);

    return {
        node1To3ExpectedCount: expectedKeys.length,
        atlasCoveredCount: expectedKeys.filter(key => frameKeys.has(key)).length,
        loadedAtlasCount: expectedKeys.filter(key => loadedKeys.has(key)).length,
        proceduralFallbackCount: expectedKeys.filter(key => fallbackKeys.has(key)).length,
        missingAtlasKeys: expectedKeys.filter(key => !frameKeys.has(key)),
        proceduralFallbackKeys: expectedKeys.filter(key => fallbackKeys.has(key)),
        priorityNotes: [
            'Node1 hero, base enemies, pickup, fist projectile, and hit VFX have atlas frames.',
            'Node2 chest now has an atlas frame; the new enemy set and ancient beast king remain procedural or missing atlas coverage.',
            'Node3 boss projectile now has an atlas frame; rival projections and boss phantom remain procedural or missing atlas coverage.'
        ]
    };
}

function publishRuntimeArtStatus() {
    runtimeArtStatus.loadedCount = runtimeArtStatus.loadedKeys.length;
    runtimeArtStatus.nodeCoverage = getNodeCoverage();
    runtimeArtStatus.gapSummary = getGapSummary();
    if (typeof window !== 'undefined') {
        window.__DAHUANG_ART_PIPELINE__ = cloneStatus(runtimeArtStatus);
    }
}

function updateAtlasLoaded(scene) {
    runtimeArtStatus.atlasLoaded = Boolean(scene?.textures?.exists(ATLAS_TEXTURE_KEY));
}

export function preloadImagegenAtlas(scene) {
    runtimeArtStatus.status = 'loading';
    updateAtlasLoaded(scene);
    publishRuntimeArtStatus();

    if (!scene.textures.exists(ATLAS_TEXTURE_KEY)) {
        scene.load.image(ATLAS_TEXTURE_KEY, imagegenManifest.atlasImage);
    }

    scene.load.once('complete', () => {
        updateAtlasLoaded(scene);
        if (runtimeArtStatus.atlasLoaded && runtimeArtStatus.status === 'loading') {
            runtimeArtStatus.status = 'atlas_ready';
        }
        publishRuntimeArtStatus();
    });

    scene.load.on('loaderror', (file) => {
        runtimeArtStatus.status = 'error';
        runtimeArtStatus.manifestError = `failed to load ${file?.src || file?.key || 'imagegen atlas'}`;
        publishRuntimeArtStatus();
    });
}

export function createAtlasFrameTexture(scene, frameKey, textureKey = frameKey) {
    updateAtlasLoaded(scene);
    const frame = imagegenManifest.frames?.[frameKey]?.frame;
    if (!frame || !scene.textures.exists(ATLAS_TEXTURE_KEY)) {
        if (!runtimeArtStatus.missingKeys.includes(textureKey)) {
            runtimeArtStatus.missingKeys.push(textureKey);
        }
        publishRuntimeArtStatus();
        return null;
    }

    const sourceImage = scene.textures.get(ATLAS_TEXTURE_KEY).getSourceImage();
    if (!sourceImage) {
        if (!runtimeArtStatus.missingKeys.includes(textureKey)) {
            runtimeArtStatus.missingKeys.push(textureKey);
        }
        publishRuntimeArtStatus();
        return null;
    }

    if (scene.textures.exists(textureKey)) {
        if (!runtimeArtStatus.loadedKeys.includes(textureKey)) {
            runtimeArtStatus.loadedKeys.push(textureKey);
        }
        publishRuntimeArtStatus();
        return textureKey;
    }

    const canvasTexture = scene.textures.createCanvas(textureKey, frame.w, frame.h);
    const ctx = canvasTexture.getContext();
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(sourceImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    canvasTexture.refresh();

    runtimeArtStatus.status = 'loaded';
    if (!runtimeArtStatus.loadedKeys.includes(textureKey)) {
        runtimeArtStatus.loadedKeys.push(textureKey);
    }
    runtimeArtStatus.fallbackKeys = runtimeArtStatus.fallbackKeys.filter((key) => key !== textureKey);
    runtimeArtStatus.missingKeys = runtimeArtStatus.missingKeys.filter((key) => key !== textureKey);
    publishRuntimeArtStatus();
    return textureKey;
}

export function recordProceduralFallback(textureKey) {
    if (!runtimeArtStatus.fallbackKeys.includes(textureKey)) {
        runtimeArtStatus.fallbackKeys.push(textureKey);
    }
    publishRuntimeArtStatus();
}

export function getRuntimeArtStatus() {
    publishRuntimeArtStatus();
    return cloneStatus(runtimeArtStatus);
}
