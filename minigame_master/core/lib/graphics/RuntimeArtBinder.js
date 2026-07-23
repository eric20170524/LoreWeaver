/**
 * RuntimeArtBinder — atlas-first art wiring for LoreWeaver gameplay adapters.
 *
 * Contract (docs/contracts/asset_pipeline_contract.md):
 *   atlas first → semantic key lookup → procedural fallback last (prototype only)
 *
 * Runtime modes (Phase A1):
 *   - prototype: procedural/fallback allowed; artSource + degradations exposed on
 *     global status and TestHooks (must never look like production art).
 *   - production: critical roles must resolve to atlas textures; missing → throw.
 *
 * Installs every frame from an imagegen-style manifest into Phaser textures,
 * then resolves roles (player / enemy / projectile / item / vfx / env …).
 */

const DEFAULT_GLOBAL_STATUS_KEY = '__LOREWEAVER_ART_PIPELINE__';

/** Critical semantic roles that production mode refuses to fake. */
const DEFAULT_CRITICAL_ROLES = Object.freeze(['player', 'hero', 'enemy', 'environment', 'env']);

export class ArtAssetMissingError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'ArtAssetMissingError';
        this.code = 'ART_ASSET_MISSING';
        this.details = details;
    }
}

const SEMANTIC_ALIASES = Object.freeze({
    player: [
        'shihao_young_runtime',
        'player_idle',
        'player',
        'lw_runtime_player_shihao',
        'lw_runtime_player_avatar',
        'hero',
        'protagonist'
    ],
    projectile: [
        'skill_fist_projectile',
        'boss_projectile',
        'lw_skill_fist_projectile',
        'projectile'
    ],
    pickup: [
        'pickup_blood_essence',
        'chest_gold',
        'antidote_gem',
        'lw_pickup_blood_essence',
        'pickup',
        'item'
    ],
    vfx: ['vfx_effect_frame', 'lw_vfx_effect_frame', 'vfx'],
    core: ['core_eye', 'lw_art_core_eye', 'objective_totem', 'lw_art_objective_totem', 'core'],
    escort: ['escort_npc', 'lw_art_escort_npc', 'escort'],
    wall: ['wall_segment', 'lw_art_wall_segment', 'wall'],
    portal: ['portal_ring', 'lw_art_portal_ring', 'portal'],
    ballista: ['ballista_bolt', 'lw_art_ballista_bolt', 'ballista'],
    whirlpool: ['whirlpool', 'lw_art_whirlpool'],
    chest: ['chest_gold', 'lw_art_chest_gold', 'chest'],
    antidote: ['antidote_gem', 'lw_art_antidote_gem', 'antidote']
});

function publishStatus(key, patch) {
    if (typeof globalThis === 'undefined') return patch;
    const prev = globalThis[key] || {};
    const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    globalThis[key] = next;
    return next;
}

function classifyFrameKey(frameKey) {
    const k = String(frameKey || '');
    if (/^player_|^shihao_|^hero_/.test(k)) return 'heroes';
    if (/^enemy_|^boss_/.test(k)) return 'enemies';
    if (/^skill_|^projectile|bolt|bullet/.test(k)) return 'projectiles';
    if (/^pickup_|^item_|^chest_|^antidote/.test(k)) return 'items';
    if (/^vfx_|^fx_/.test(k)) return 'vfx';
    if (/^env_|^bg_|^ground_|^landmark/.test(k)) return 'setpieces';
    if (/^ui_/.test(k)) return 'ui';
    if (/core|totem|objective|portal|wall|escort|whirlpool|ballista/.test(k)) return 'props';
    return 'misc';
}

function textureKeyForFrame(frameKey) {
    // Prefer stable lw_ keys for combat bindings used by GameRunner historically
    // Aligns with survivor_horde golden_asset_fixture.semanticAssetMapping
    const map = {
        shihao_young_runtime: 'lw_runtime_player_shihao',
        player_idle: 'lw_runtime_player_idle',
        player_walk_0: 'lw_runtime_player_walk',
        player_walk_1: 'lw_runtime_player_walk_1',
        player_attack: 'lw_runtime_player_attack',
        player_hurt: 'lw_runtime_player_hurt',
        player_death: 'lw_runtime_player_death',
        player_dash: 'lw_runtime_player_dash',
        enemy_wild_rhino: 'lw_enemy_wild_rhino',
        enemy_green_scaled_eagle: 'lw_enemy_green_scaled_eagle',
        enemy_rock_golem: 'lw_enemy_rock_golem',
        enemy_qiongqi_cub: 'lw_enemy_qiongqi_cub',
        skill_fist_projectile: 'lw_skill_fist_projectile',
        pickup_blood_essence: 'lw_pickup_blood_essence',
        vfx_effect_frame: 'lw_vfx_effect_frame',
        env_bg_desert: 'lw_art_env_bg_desert'
    };
    if (map[frameKey]) return map[frameKey];
    if (frameKey.startsWith('enemy_') && !frameKey.includes('_walk') && !frameKey.includes('_attack')
        && !frameKey.includes('_hurt') && !frameKey.includes('_death') && !frameKey.includes('_idle')) {
        return `lw_enemy_${frameKey.replace(/^enemy_/, '')}`;
    }
    return `lw_art_${frameKey}`;
}

export default class RuntimeArtBinder {
    constructor(options = {}) {
        this.statusKey = options.statusKey || DEFAULT_GLOBAL_STATUS_KEY;
        this.atlasTextureKey = options.atlasTextureKey || 'lw_imagegen_combat_atlas';
        this.manifestCacheKey = options.manifestCacheKey || 'lw_imagegen_manifest';
        this.scene = null;
        this.manifest = null;
        this.installed = new Map(); // textureKey -> { frameKey, group, w, h }
        this.frameIndex = new Map(); // frameKey -> textureKey
        this.degradations = []; // { role, artSource, reason, at }
        this.criticalRoles = new Set(
            Array.isArray(options.criticalRoles)
                ? options.criticalRoles
                : DEFAULT_CRITICAL_ROLES
        );
        this.runtimeMode = 'prototype';
        this.allowProceduralFallback = true;
        this.onMissingAsset = 'degrade'; // degrade | throw_hard_error
        this.status = {
            status: 'idle',
            loadedCount: 0,
            expectedCount: 0,
            loadedKeys: [],
            missingKeys: [],
            groups: {},
            frameKeys: [],
            runtimeMode: 'prototype',
            allowProceduralFallback: true,
            artDegradations: [],
            degradationCount: 0
        };
        this.setRuntimeMode(options.runtimeMode || options.mode || 'prototype', {
            allowProceduralFallback: options.allowProceduralFallback,
            onMissingAsset: options.onMissingAsset,
            criticalRoles: options.criticalRoles
        });
    }

    /**
     * Switch prototype vs production art policy.
     * @param {'prototype'|'production'} mode
     * @param {{ allowProceduralFallback?: boolean, onMissingAsset?: string, criticalRoles?: string[] }} [policy]
     */
    setRuntimeMode(mode, policy = {}) {
        const normalized = String(mode || 'prototype').toLowerCase() === 'production'
            ? 'production'
            : 'prototype';
        this.runtimeMode = normalized;
        if (Array.isArray(policy.criticalRoles) && policy.criticalRoles.length) {
            this.criticalRoles = new Set(policy.criticalRoles);
        }
        if (policy.allowProceduralFallback != null) {
            this.allowProceduralFallback = Boolean(policy.allowProceduralFallback);
        } else {
            this.allowProceduralFallback = normalized !== 'production';
        }
        if (policy.onMissingAsset) {
            this.onMissingAsset = policy.onMissingAsset;
        } else {
            this.onMissingAsset = this.allowProceduralFallback ? 'degrade' : 'throw_hard_error';
        }
        this._publishPolicy();
        return this;
    }

    /**
     * Apply golden fixture (or equivalent) fallbackPolicy block.
     * Uses productionMode or prototypeMode based on current runtimeMode.
     */
    applyFallbackPolicy(fallbackPolicy = {}) {
        const block = this.runtimeMode === 'production'
            ? (fallbackPolicy.productionMode || {})
            : (fallbackPolicy.prototypeMode || {});
        return this.setRuntimeMode(this.runtimeMode, {
            allowProceduralFallback: block.allowProceduralFallback,
            onMissingAsset: block.onMissingAsset,
            criticalRoles: block.criticalRoles
        });
    }

    isProduction() {
        return this.runtimeMode === 'production';
    }

    isCriticalRole(roleOrId) {
        const role = String(roleOrId || '').toLowerCase();
        if (this.criticalRoles.has(role)) return true;
        if (role === 'hero' && this.criticalRoles.has('player')) return true;
        if (role.startsWith('enemy') && this.criticalRoles.has('enemy')) return true;
        if ((role.startsWith('env') || role === 'background' || role === 'bg_default')
            && (this.criticalRoles.has('environment') || this.criticalRoles.has('env'))) {
            return true;
        }
        return false;
    }

    _publishPolicy() {
        this.status = publishStatus(this.statusKey, {
            ...this.status,
            runtimeMode: this.runtimeMode,
            allowProceduralFallback: this.allowProceduralFallback,
            onMissingAsset: this.onMissingAsset,
            criticalRoles: [...this.criticalRoles],
            artDegradations: [...this.degradations],
            degradationCount: this.degradations.length,
            binder: 'RuntimeArtBinder'
        });
        return this.status;
    }

    _recordDegradation(role, artSource, reason = 'missing_atlas') {
        const entry = {
            role: String(role || 'unknown'),
            artSource: artSource || 'missing',
            reason,
            at: new Date().toISOString()
        };
        this.degradations.push(entry);
        // keep last 64 entries for hooks
        if (this.degradations.length > 64) {
            this.degradations.splice(0, this.degradations.length - 64);
        }
        this._publishPolicy();
        return entry;
    }

    clearDegradations() {
        this.degradations = [];
        this._publishPolicy();
        return this;
    }

    getArtTelemetry() {
        return {
            runtimeMode: this.runtimeMode,
            allowProceduralFallback: this.allowProceduralFallback,
            onMissingAsset: this.onMissingAsset,
            criticalRoles: [...this.criticalRoles],
            degradations: [...this.degradations],
            degradationCount: this.degradations.length,
            atlasStatus: this.status?.status || 'idle',
            loadedCount: this.status?.loadedCount || 0
        };
    }

    /**
     * Mirror art policy + degradations onto a TestHooks instance (or plain update target).
     */
    syncToTestHooks(testHooks) {
        const telemetry = this.getArtTelemetry();
        if (testHooks && typeof testHooks.update === 'function') {
            testHooks.update({
                artRuntimeMode: telemetry.runtimeMode,
                artAllowProceduralFallback: telemetry.allowProceduralFallback,
                artSourceSummary: telemetry.degradationCount > 0 ? 'degraded' : 'atlas_or_idle',
                artDegradations: telemetry.degradations,
                artDegradationCount: telemetry.degradationCount,
                artAtlasStatus: telemetry.atlasStatus
            });
        }
        return telemetry;
    }

    /**
     * Production hard-fail helper for missing critical art.
     */
    assertCriticalResolved(roleOrId, textureKey, options = {}) {
        if (textureKey) return textureKey;
        const critical = options.critical != null
            ? Boolean(options.critical)
            : this.isCriticalRole(roleOrId);
        const mustThrow = !this.allowProceduralFallback
            && critical
            && (this.onMissingAsset === 'throw_hard_error' || this.isProduction());
        if (mustThrow) {
            throw new ArtAssetMissingError(
                `[RuntimeArtBinder] production missing critical art for role "${roleOrId}"`,
                {
                    role: roleOrId,
                    runtimeMode: this.runtimeMode,
                    allowProceduralFallback: this.allowProceduralFallback,
                    enemyId: options.enemyId || null,
                    clip: options.clip || null
                }
            );
        }
        return null;
    }

    /**
     * Validate card requiredAssets (or golden fixture requiredAssets) against loaded textures.
     * Production: throws ArtAssetMissingError when any critical entry is missing.
     * Prototype: records degradations and returns { ok:false, issues }.
     *
     * options.semanticAssetMapping — same shape as golden_asset_fixture.semanticAssetMapping
     * options.enemyIdMap — kind → enemy id (e.g. mob → wild_rhino)
     * options.envKeyMap — logical env id → texture/frame key
     */
    validateRequiredAssets(requiredAssets = {}, options = {}) {
        const issues = [];
        const semantic = options.semanticAssetMapping || {};
        const enemyIdMap = options.enemyIdMap || options.semanticEnemyMap || {};
        const envKeyMap = options.envKeyMap || semantic.environment || {};

        // Prefer mapped clip textures, then generic player resolve.
        const playerClips = requiredAssets.playerClips || ['idle'];
        let playerOk = false;
        for (const clip of playerClips) {
            const mapped = semantic.player?.[clip];
            if (mapped && this.has(mapped)) {
                playerOk = true;
                break;
            }
            if (this.resolve('player', { clip })) {
                playerOk = true;
                break;
            }
        }
        if (!playerOk && !this.resolve('player')) {
            issues.push({ role: 'player', reason: 'missing_player_texture' });
        }

        for (const kind of requiredAssets.enemyKinds || []) {
            const mappedTex = semantic.enemy?.[kind];
            if (mappedTex && this.has(mappedTex)) continue;
            const enemyId = enemyIdMap[kind]
                || (mappedTex ? String(mappedTex).replace(/^lw_enemy_/, '') : null)
                || kind;
            const key = this.resolve('enemy', { enemyId });
            if (!key) {
                issues.push({ role: 'enemy', enemyId, enemyKind: kind, reason: 'missing_enemy_texture' });
            }
        }

        for (const env of requiredAssets.environments || []) {
            const mapped = envKeyMap[env] || env;
            const prefer = [
                mapped,
                env,
                env === 'bg_default' ? 'env_bg_desert' : null,
                env === 'bg_default' ? 'lw_art_env_bg_desert' : null,
                `lw_art_${env}`,
                textureKeyForFrame(env),
                textureKeyForFrame(String(mapped).replace(/^lw_art_/, ''))
            ].filter(Boolean);
            const envKey = this.resolveEnvKey(null, prefer)
                || this._existing(prefer, this.scene);
            if (!envKey) {
                issues.push({ role: 'environment', key: env, mapped, reason: 'missing_env_texture' });
            }
        }

        if (issues.length === 0) {
            return { ok: true, issues: [] };
        }

        for (const issue of issues) {
            this._recordDegradation(issue.role, 'missing', issue.reason);
        }

        const mustThrow = !this.allowProceduralFallback
            && (this.onMissingAsset === 'throw_hard_error' || this.isProduction());
        if (mustThrow) {
            throw new ArtAssetMissingError(
                `[RuntimeArtBinder] production requiredAssets validation failed (${issues.length} missing)`,
                { issues, runtimeMode: this.runtimeMode }
            );
        }
        return { ok: false, issues };
    }

    /**
     * After atlas install, seed mock/scene textures by frame list (no PNG) for contract tests,
     * or re-index semantic aliases for golden texture keys.
     */
    seedTextureKeys(textureKeys = []) {
        if (!this.scene?.textures) return this;
        for (const key of textureKeys) {
            if (!key) continue;
            if (typeof this.scene.textures.addCanvas === 'function') {
                if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key);
            } else if (this.scene.textures._keys instanceof Set) {
                this.scene.textures._keys.add(String(key));
            }
            this.frameIndex.set(key, key);
            this.installed.set(key, { frameKey: key, group: classifyFrameKey(key), w: 64, h: 64 });
        }
        return this;
    }

    /**
     * Register semanticAssetMapping texture keys into frameIndex (call after install or seed).
     */
    applySemanticAssetMapping(semanticAssetMapping = {}) {
        const collect = [];
        const player = semanticAssetMapping.player || {};
        const enemy = semanticAssetMapping.enemy || {};
        const environment = semanticAssetMapping.environment || {};
        for (const v of Object.values(player)) collect.push(v);
        for (const v of Object.values(enemy)) collect.push(v);
        for (const v of Object.values(environment)) collect.push(v);
        for (const key of collect) {
            if (!key) continue;
            if (this.has(key) || this.scene?.textures?.exists?.(key)) {
                this.frameIndex.set(key, key);
            }
        }
        // Logical env alias used by cards: bg_default → desert bg texture
        if (environment.bg_default && this.has(environment.bg_default)) {
            this.frameIndex.set('bg_default', environment.bg_default);
            this.frameIndex.set('alias:bg_default', environment.bg_default);
        }
        return this;
    }

    /**
     * Queue atlas + manifest loads on a Phaser loader.
     */
    preload(scene, paths = null) {
        if (!scene?.load || !paths) {
            this.status = publishStatus(this.statusKey, {
                status: 'skipped_no_workspace_assets',
                expectedCount: 0,
                loadedCount: 0,
                loadedKeys: [],
                missingKeys: []
            });
            return this;
        }
        this.status = publishStatus(this.statusKey, {
            status: 'loading',
            mode: paths.mode || 'workspace_live',
            manifestPath: paths.manifestPath,
            atlasPath: paths.atlasPath,
            provenancePath: paths.provenancePath || null
        });
        scene.load.json(this.manifestCacheKey, paths.manifestPath);
        scene.load.image(this.atlasTextureKey, paths.atlasPath);
        return this;
    }

    /**
     * Slice all frames from the loaded atlas into individual textures.
     */
    install(scene, paths = null) {
        this.scene = scene;
        if (!paths || !scene?.textures) {
            this.status = publishStatus(this.statusKey, {
                ...this.status,
                status: 'skipped_no_workspace_assets'
            });
            return this.getStatus();
        }

        const manifest = scene.cache?.json?.get?.(this.manifestCacheKey) || this.manifest;
        this.manifest = manifest || {};
        const frames = this.manifest.frames || {};
        const frameKeys = Object.keys(frames);
        const loadedKeys = [];
        const missingKeys = [];
        const groups = {};

        for (const frameKey of frameKeys) {
            const texKey = textureKeyForFrame(frameKey);
            const ok = this.copyFrame(scene, frameKey, texKey, frames[frameKey]);
            if (ok) {
                const group = classifyFrameKey(frameKey);
                this.installed.set(texKey, {
                    frameKey,
                    group,
                    w: frames[frameKey]?.frame?.w || 64,
                    h: frames[frameKey]?.frame?.h || 64
                });
                this.frameIndex.set(frameKey, texKey);
                // also index raw frameKey as alias if different
                if (texKey !== frameKey) this.frameIndex.set(`alias:${frameKey}`, texKey);
                loadedKeys.push(texKey);
                groups[group] = groups[group] || [];
                if (!groups[group].includes(texKey)) groups[group].push(texKey);
            } else {
                missingKeys.push(frameKey);
            }
        }

        // Extra semantic aliases for primary combat keys
        this._linkAlias('shihao_young_runtime', 'lw_runtime_player_avatar');

        this.status = publishStatus(this.statusKey, {
            status: loadedKeys.length > 0 ? 'loaded' : 'error',
            mode: paths.mode || 'workspace_live',
            generatedAtlasStatus: this.manifest.generatedAtlasStatus || 'unknown',
            generationStatus: this.manifest.generationStatus || 'unknown',
            provenancePath: this.manifest.provenancePath || paths.provenancePath || null,
            sourceImage: this.manifest.sourceImage || null,
            expectedCount: frameKeys.length,
            loadedCount: loadedKeys.length,
            loadedKeys,
            missingKeys,
            groups,
            frameKeys,
            runtimeMode: this.runtimeMode,
            allowProceduralFallback: this.allowProceduralFallback,
            onMissingAsset: this.onMissingAsset,
            criticalRoles: [...this.criticalRoles],
            artDegradations: [...this.degradations],
            degradationCount: this.degradations.length,
            binder: 'RuntimeArtBinder'
        });
        return this.getStatus();
    }

    _linkAlias(sourceFrameKey, aliasTextureKey) {
        const src = this.frameIndex.get(sourceFrameKey) || this.frameIndex.get(`alias:${sourceFrameKey}`);
        if (!src || !this.scene?.textures?.exists(src)) return;
        if (this.scene.textures.exists(aliasTextureKey)) return;
        // re-copy under alias if we know frame
        const meta = this.installed.get(src);
        if (!meta) return;
        const frameSpec = this.manifest?.frames?.[meta.frameKey];
        if (this.copyFrame(this.scene, meta.frameKey, aliasTextureKey, frameSpec)) {
            this.installed.set(aliasTextureKey, { ...meta, frameKey: meta.frameKey });
            this.frameIndex.set(aliasTextureKey, aliasTextureKey);
        }
    }

    copyFrame(scene, frameKey, textureKey, frameSpec) {
        const frame = frameSpec?.frame;
        if (!frame || !scene.textures.exists(this.atlasTextureKey)) return false;
        const atlasTexture = scene.textures.get(this.atlasTextureKey);
        const sourceImage = atlasTexture.getSourceImage?.();
        if (!sourceImage) return false;

        try {
            if (scene.textures.exists(textureKey)) {
                scene.textures.remove(textureKey);
            }
            // Copy full cell; do not trim. Incomplete figures were caused by empty
            // atlas cells / bad source packing, not by runtime crop.
            const canvasTexture = scene.textures.createCanvas(textureKey, frame.w, frame.h);
            const ctx = canvasTexture.getContext();
            ctx.clearRect(0, 0, frame.w, frame.h);
            // Clamp source rect to atlas image bounds (avoid partial edge slices)
            const atlasW = sourceImage.width || sourceImage.naturalWidth || 0;
            const atlasH = sourceImage.height || sourceImage.naturalHeight || 0;
            let sx = frame.x;
            let sy = frame.y;
            let sw = frame.w;
            let sh = frame.h;
            if (atlasW > 0 && atlasH > 0) {
                if (sx + sw > atlasW) sw = Math.max(1, atlasW - sx);
                if (sy + sh > atlasH) sh = Math.max(1, atlasH - sy);
                sx = Math.max(0, Math.min(sx, Math.max(0, atlasW - 1)));
                sy = Math.max(0, Math.min(sy, Math.max(0, atlasH - 1)));
            }
            // Draw centered into full cell so smaller source rects stay complete
            const dx = Math.floor((frame.w - sw) / 2);
            const dy = Math.floor((frame.h - sh) / 2);
            ctx.drawImage(sourceImage, sx, sy, sw, sh, dx, dy, sw, sh);
            canvasTexture.refresh();
            return true;
        } catch (error) {
            console.warn('[RuntimeArtBinder] copyFrame failed', frameKey, error);
            return false;
        }
    }

    getStatus() {
        return { ...this.status, installedCount: this.installed.size };
    }

    has(textureOrFrameKey) {
        if (!textureOrFrameKey) return false;
        if (this.scene?.textures?.exists(textureOrFrameKey)) return true;
        const mapped = this.frameIndex.get(textureOrFrameKey)
            || this.frameIndex.get(`alias:${textureOrFrameKey}`);
        return Boolean(mapped && this.scene?.textures?.exists(mapped));
    }

    /**
     * Resolve a texture key for a semantic role or enemy id.
     */
    resolve(roleOrId, options = {}) {
        const clip = options.clip || null; // idle|walk|attack|hurt|death
        const candidates = [];

        if (roleOrId === 'player' || roleOrId === 'hero') {
            if (clip) {
                candidates.push(`player_${clip}`, `player_${clip}_0`, `lw_runtime_player_${clip}`);
            }
            candidates.push(...SEMANTIC_ALIASES.player);
        } else if (roleOrId === 'enemy' || options.enemyId) {
            const id = options.enemyId || options.id || roleOrId;
            const base = String(id).replace(/^enemy_/, '').replace(/^lw_enemy_/, '');
            if (clip) {
                candidates.push(`enemy_${base}_${clip}`, `enemy_${base}_${clip}_0`);
            }
            candidates.push(
                `lw_enemy_${base}`,
                `enemy_${base}`,
                `enemy_${base}_idle`,
                base
            );
        } else if (SEMANTIC_ALIASES[roleOrId]) {
            candidates.push(...SEMANTIC_ALIASES[roleOrId]);
        } else {
            const id = String(roleOrId);
            candidates.push(id, `lw_art_${id}`, `lw_enemy_${id}`, `enemy_${id}`, `player_${id}`);
        }

        if (Array.isArray(options.prefer)) candidates.unshift(...options.prefer);

        for (const key of candidates) {
            if (this.scene?.textures?.exists(key)) return key;
            const mapped = this.frameIndex.get(key) || this.frameIndex.get(`alias:${key}`);
            if (mapped && this.scene?.textures?.exists(mapped)) return mapped;
        }
        return options.fallback || null;
    }

    /**
     * List texture keys for a clip (player multi-frame or enemy single/multi).
     */
    resolveClipKeys(roleOrId, clip = 'walk', options = {}) {
        const keys = [];
        const push = (k) => {
            if (k && this.scene?.textures?.exists(k) && !keys.includes(k)) keys.push(k);
        };
        const resolveFrame = (frameKey) => {
            if (this.scene?.textures?.exists(frameKey)) return frameKey;
            const mapped = this.frameIndex.get(frameKey);
            if (mapped && this.scene?.textures?.exists(mapped)) return mapped;
            const lw = textureKeyForFrame(frameKey);
            if (this.scene?.textures?.exists(lw)) return lw;
            return null;
        };

        if (roleOrId === 'player' || roleOrId === 'hero') {
            for (let i = 0; i < 8; i += 1) {
                push(resolveFrame(`player_${clip}_${i}`));
            }
            push(resolveFrame(`player_${clip}`));
            // idle fallback chain
            if (clip === 'idle') {
                push(this.resolve('player'));
                push(resolveFrame('player_idle'));
            }
            if (clip === 'walk' && keys.length < 2) {
                push(resolveFrame('player_idle'));
                push(resolveFrame('player_walk_0'));
                push(resolveFrame('player_walk_1'));
            }
            return keys;
        }

        const id = String(options.enemyId || roleOrId || '')
            .replace(/^enemy_/, '')
            .replace(/^lw_enemy_/, '');
        // Prefer explicit clip frames, then numbered, then base
        push(resolveFrame(`enemy_${id}_${clip}`));
        for (let i = 0; i < 4; i += 1) {
            push(resolveFrame(`enemy_${id}_${clip}_${i}`));
        }
        if (clip === 'idle' || clip === 'walk') {
            push(resolveFrame(`enemy_${id}`));
            push(resolveFrame(`enemy_${id}_idle`));
            push(this.resolve('enemy', { enemyId: id }));
        }
        // For attack/hurt/death with only one frame, pair with idle for a 2-frame blink
        if (keys.length === 1 && clip !== 'idle') {
            const idle = resolveFrame(`enemy_${id}_idle`) || resolveFrame(`enemy_${id}`) || this.resolve('enemy', { enemyId: id });
            if (idle && idle !== keys[0]) keys.unshift(idle);
        }
        return keys;
    }

    /**
     * Register a Phaser animation from clip keys if possible.
     * @returns {string|null} animation key
     */
    ensureAnimation(scene, animKey, textureKeys, config = {}) {
        if (!scene?.anims || !Array.isArray(textureKeys) || textureKeys.length === 0) return null;
        const existing = scene.anims.exists?.(animKey) || scene.anims.get?.(animKey);
        if (existing) return animKey;

        const frames = textureKeys
            .filter((k) => scene.textures.exists(k))
            .map((key) => ({ key }));
        if (!frames.length) return null;

        // Single-frame "anim" still useful for setTexture switching
        if (frames.length === 1) {
            this._singleFrameAnims = this._singleFrameAnims || new Set();
            this._singleFrameAnims.add(animKey);
            this._animFrameMap = this._animFrameMap || new Map();
            this._animFrameMap.set(animKey, frames[0].key);
            return animKey;
        }

        try {
            scene.anims.create({
                key: animKey,
                frames,
                frameRate: config.frameRate || (frames.length <= 2 ? 6 : 10),
                repeat: config.repeat == null ? -1 : config.repeat
            });
            return animKey;
        } catch (error) {
            console.warn('[RuntimeArtBinder] ensureAnimation failed', animKey, error);
            return null;
        }
    }

    /**
     * Ensure and play a role/clip animation on a sprite.
     */
    playClip(sprite, roleOrId, clip = 'walk', options = {}) {
        if (!sprite || !this.scene) return null;
        const enemyId = options.enemyId || (roleOrId !== 'player' && roleOrId !== 'hero' ? roleOrId : null);
        const keys = this.resolveClipKeys(
            roleOrId === 'player' || roleOrId === 'hero' ? 'player' : (enemyId || roleOrId),
            clip,
            { enemyId }
        );
        const animKey = options.animKey
            || `lw_${roleOrId === 'player' || roleOrId === 'hero' ? 'player' : `enemy_${enemyId}`}_${clip}`;

        const ensured = this.ensureAnimation(this.scene, animKey, keys, {
            frameRate: options.frameRate,
            repeat: options.repeat
        });
        if (!ensured) return null;

        // single-frame: just set texture
        if (this._singleFrameAnims?.has(animKey)) {
            const tex = this._animFrameMap.get(animKey);
            if (tex && sprite.setTexture) {
                sprite.setTexture(tex);
                sprite.setData?.('artClip', clip);
                sprite.setData?.('artAnim', animKey);
            }
            return animKey;
        }

        if (sprite.play && this.scene.anims.exists(animKey)) {
            const current = sprite.anims?.currentAnim?.key;
            if (current !== animKey || !sprite.anims?.isPlaying) {
                sprite.play(animKey, true);
            }
            sprite.setData?.('artClip', clip);
            sprite.setData?.('artAnim', animKey);
        }
        return animKey;
    }

    /**
     * Create a tiled / stretched environment background from env_* frames.
     */
    createBackground(scene, options = {}) {
        const width = options.width || scene.scale.width;
        const height = options.height || scene.scale.height;
        const container = scene.add.container(0, 0).setDepth(options.depth ?? -10);

        const envKey = options.envKey
            || this.resolveEnvKey(options.nodeId, options.prefer)
            || null;

        const bgTex = envKey && scene.textures.exists(envKey) ? envKey : null;
        if (!bgTex) {
            this.assertCriticalResolved('environment', null, {
                critical: options.critical != null ? options.critical : true
            });
            this._recordDegradation('environment', 'procedural', 'missing_env_texture');
        }
        if (bgTex) {
            // Stretch primary bg
            const bg = scene.add.image(width / 2, height / 2, bgTex);
            const scale = Math.max(width / Math.max(bg.width, 1), height / Math.max(bg.height, 1));
            bg.setScale(scale * 1.05);
            bg.setAlpha(options.alpha ?? 0.55);
            container.add(bg);
        } else {
            const g = scene.add.graphics();
            g.fillGradientStyle(0x020617, 0x020617, 0x0f172a, 0x0b1220, 1);
            g.fillRect(0, 0, width, height);
            container.add(g);
        }

        // Optional ground / landmark deco
        const ground = this.resolve('env_ground_patch', { prefer: ['env_ground_patch', 'lw_art_env_ground_patch'] })
            || (scene.textures.exists('lw_art_env_ground_patch') ? 'lw_art_env_ground_patch' : null)
            || (scene.textures.exists(textureKeyForFrame('env_ground_patch')) ? textureKeyForFrame('env_ground_patch') : null);
        const groundKey = this._existing([
            this.frameIndex.get('env_ground_patch'),
            textureKeyForFrame('env_ground_patch'),
            'env_ground_patch'
        ], scene);
        if (groundKey) {
            for (let i = 0; i < 5; i += 1) {
                const patch = scene.add.image(
                    (width * (i + 0.5)) / 5,
                    height * 0.82 + (i % 2) * 12,
                    groundKey
                ).setAlpha(0.35).setScale(1.2);
                container.add(patch);
            }
        }

        const rockKey = this._existing([
            this.frameIndex.get('env_landmark_rock'),
            textureKeyForFrame('env_landmark_rock'),
            'env_landmark_rock'
        ], scene);
        if (rockKey && options.landmarks !== false) {
            const rock = scene.add.image(width * 0.18, height * 0.7, rockKey).setAlpha(0.4).setScale(1.4);
            const rock2 = scene.add.image(width * 0.86, height * 0.65, rockKey).setAlpha(0.32).setScale(1.1).setFlipX(true);
            container.add(rock);
            container.add(rock2);
        }

        container.setData?.('envKey', envKey || 'procedural');
        container.setData?.('artSource', envKey ? 'atlas' : 'procedural');
        return container;
    }

    resolveEnvKey(nodeId, prefer = null) {
        if (Array.isArray(prefer)) {
            for (const p of prefer) {
                const k = this._existing([p, textureKeyForFrame(p), this.frameIndex.get(p)], this.scene);
                if (k) return k;
            }
        }
        const id = Number(String(nodeId || '').replace(/\D/g, '')) || 0;
        const table = [
            'env_bg_desert', 'env_bg_cliff', 'env_bg_arena', 'env_bg_tide',
            'env_bg_city', 'env_bg_poison', 'env_bg_tournament', 'env_bg_ruins',
            'env_bg_escort', 'env_bg_wall', 'env_bg_void', 'env_bg_finale'
        ];
        const pick = table[(Math.max(id, 1) - 1) % table.length] || table[0];
        return this._existing([
            this.frameIndex.get(pick),
            textureKeyForFrame(pick),
            pick,
            'lw_art_env_bg_desert'
        ], this.scene);
    }

    _existing(candidates, scene) {
        for (const k of candidates) {
            if (k && scene?.textures?.exists(k)) return k;
        }
        return null;
    }

    /**
     * Create a sprite using atlas art when available, else invoke fallbackFactory.
     * Production mode throws for critical roles when no atlas texture is available.
     */
    createSprite(scene, roleOrId, options = {}) {
        const textureKey = this.resolve(roleOrId, options);
        if (textureKey && scene.textures.exists(textureKey)) {
            const sprite = scene.add.sprite(options.x || 0, options.y || 0, textureKey);
            if (options.displaySize) sprite.setDisplaySize(options.displaySize, options.displaySize);
            if (options.displayWidth) sprite.setDisplaySize(options.displayWidth, options.displayHeight || options.displayWidth);
            if (options.depth != null) sprite.setDepth(options.depth);
            sprite.setData('artSource', 'atlas');
            sprite.setData('artKey', textureKey);
            sprite.setData('artRole', roleOrId);
            if (options.clip) {
                this.playClip(sprite, roleOrId, options.clip, {
                    enemyId: options.enemyId,
                    frameRate: options.frameRate,
                    repeat: options.repeat
                });
            }
            return sprite;
        }

        // Hard-fail before any procedural/fallback path for critical production roles.
        this.assertCriticalResolved(roleOrId, null, {
            critical: options.critical,
            enemyId: options.enemyId,
            clip: options.clip
        });

        if (typeof options.fallbackFactory === 'function') {
            const node = options.fallbackFactory(scene, options);
            if (node?.setData) {
                node.setData('artSource', 'fallback');
                node.setData('artRole', roleOrId);
            }
            this._recordDegradation(roleOrId, 'fallback', 'missing_atlas_used_fallback_factory');
            return node;
        }
        // last resort circle
        const color = options.color || 0x94a3b8;
        const r = options.radius || 14;
        const circle = scene.add.circle(options.x || 0, options.y || 0, r, color, 1);
        circle.setData?.('artSource', 'primitive');
        circle.setData?.('artRole', roleOrId);
        this._recordDegradation(roleOrId, 'primitive', 'missing_atlas_used_primitive');
        return circle;
    }

    /**
     * Build a lightweight art context object for adapters.
     */
    createContext(scene = this.scene) {
        const binder = this;
        // ensure binder.scene points at active scene for anims
        if (scene) binder.scene = scene;
        return {
            binder,
            status: () => binder.getStatus(),
            artTelemetry: () => binder.getArtTelemetry(),
            syncToTestHooks: (hooks) => binder.syncToTestHooks(hooks),
            setRuntimeMode: (mode, policy) => binder.setRuntimeMode(mode, policy),
            applyFallbackPolicy: (policy) => binder.applyFallbackPolicy(policy),
            validateRequiredAssets: (req, opts) => binder.validateRequiredAssets(req, opts),
            has: (key) => binder.has(key),
            resolve: (role, opts) => binder.resolve(role, opts),
            resolveClipKeys: (role, clip, opts) => binder.resolveClipKeys(role, clip, opts),
            ensureAnimation: (animKey, keys, cfg) => binder.ensureAnimation(scene, animKey, keys, cfg),
            playClip: (sprite, role, clip, opts) => binder.playClip(sprite, role, clip, opts),
            createSprite: (role, opts) => binder.createSprite(scene, role, opts),
            createBackground: (opts) => binder.createBackground(scene, opts),
            resolveEnvKey: (nodeId, prefer) => binder.resolveEnvKey(nodeId, prefer),
            playerKey: () => binder.resolve('player'),
            enemyKey: (id, clip) => binder.resolve('enemy', { enemyId: id, clip }),
            projectileKey: () => binder.resolve('projectile'),
            pickupKey: () => binder.resolve('pickup'),
            vfxKey: () => binder.resolve('vfx'),
            propKey: (name) => binder.resolve(name, {
                prefer: [name, `lw_art_${name}`, textureKeyForFrame(name)]
            })
        };
    }
}

export {
    DEFAULT_GLOBAL_STATUS_KEY,
    DEFAULT_CRITICAL_ROLES,
    SEMANTIC_ALIASES,
    textureKeyForFrame,
    classifyFrameKey
};
