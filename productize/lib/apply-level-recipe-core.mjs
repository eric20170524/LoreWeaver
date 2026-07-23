/**
 * Shared Level Recipe apply logic used by CLI and workbench API.
 * Single write path: mutates workspace node JSON; marks gate reports stale on write.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { markGateReportsStale } from "./mark-gate-reports-stale.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LORE_ROOT = path.resolve(__dirname, "../..");
export const DEFAULT_REPORTS = path.join(
  LORE_ROOT,
  "minigame_master/capabilities/reports"
);

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function findNodeFile(nodesDir, nodeId) {
  const want = String(nodeId);
  for (const f of fs.readdirSync(nodesDir)) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(nodesDir, f);
    const n = readJson(p);
    if (String(n.id) === want) return { path: p, node: n };
  }
  return null;
}

export function compileRecipe(recipePath, loreRoot = LORE_ROOT) {
  const compileScript = path.join(loreRoot, "productize/jobs/compile-level-recipe.mjs");
  const compile = spawnSync(process.execPath, [compileScript, recipePath], {
    encoding: "utf8",
    cwd: loreRoot
  });
  return {
    ok: compile.status === 0,
    status: compile.status,
    stdout: compile.stdout || "",
    stderr: compile.stderr || ""
  };
}

/**
 * Apply recipe fields onto a node object (pure mutation of provided node).
 */
export function applyRecipeToNode(node, recipe, content, locale) {
  const pickLoc = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    return obj[locale] || obj[content?.defaultLocale] || Object.values(obj)[0] || null;
  };

  const before = structuredClone(node);
  node.mechanics = recipe.cardId;
  node.gameplay = {
    ...(node.gameplay || {}),
    adapter: "phaser",
    cardId: recipe.cardId,
    modifiers: recipe.modifiers || [],
    knobs: {
      ...((node.gameplay && node.gameplay.knobs) || {}),
      ...(recipe.knobs || {}),
      recipeId: recipe.recipeId,
      balanceProfile: recipe.balanceProfile || null
    },
    patchLevel: "L2"
  };

  if (content?.levelMeta) {
    const title = pickLoc(content.levelMeta.title);
    const intro = pickLoc(content.levelMeta.intro);
    if (title) node.title = title;
    if (intro) node.intro = intro;
  }
  if (recipe.knobs?.durationSec) node.durationLimit = recipe.knobs.durationSec;
  if (recipe.knobs?.goalValue != null) node.goalValue = recipe.knobs.goalValue;
  if (recipe.knobs?.difficulty != null) node.difficulty = recipe.knobs.difficulty;

  return { before, node };
}

/**
 * Full apply path: compile → mutate node → optional write → mark reports stale.
 *
 * @param {object} opts
 * @param {string} opts.recipePath absolute or relative to lore root
 * @param {string} opts.workspaceId
 * @param {string|number} opts.nodeId
 * @param {boolean} [opts.dryRun=false]
 * @param {string} [opts.loreRoot]
 * @param {string} [opts.reportsDir]
 * @param {boolean} [opts.markStale=true] mark gate reports stale on successful write
 * @param {boolean} [opts.skipCompile=false]
 */
export function applyLevelRecipe(opts) {
  const loreRoot = opts.loreRoot || LORE_ROOT;
  const reportsDir = opts.reportsDir || DEFAULT_REPORTS;
  const dryRun = Boolean(opts.dryRun);
  const markStale = opts.markStale !== false;
  const workspaceId = opts.workspaceId;
  const nodeId = opts.nodeId;

  const recipePath = path.isAbsolute(opts.recipePath)
    ? opts.recipePath
    : path.join(loreRoot, opts.recipePath);

  if (!opts.skipCompile) {
    const compile = compileRecipe(recipePath, loreRoot);
    if (!compile.ok) {
      return {
        ok: false,
        status: "failed",
        reasons: ["recipe compile failed; refuse apply"],
        compileStdout: compile.stdout,
        compileStderr: compile.stderr
      };
    }
  }

  if (!fs.existsSync(recipePath)) {
    return { ok: false, status: "failed", reasons: [`recipe missing: ${recipePath}`] };
  }

  const recipe = readJson(recipePath);
  const nodesDir = path.join(
    loreRoot,
    "data/workspaces",
    workspaceId,
    "loreweaver/nodes"
  );
  if (!fs.existsSync(nodesDir)) {
    return { ok: false, status: "failed", reasons: [`nodes dir missing: ${nodesDir}`] };
  }

  const found = findNodeFile(nodesDir, nodeId);
  if (!found) {
    return {
      ok: false,
      status: "failed",
      reasons: [`node id ${nodeId} not found in ${nodesDir}`]
    };
  }

  const contentPath =
    typeof recipe.contentPackRef === "string"
      ? path.join(loreRoot, recipe.contentPackRef)
      : path.join(loreRoot, recipe.contentPackRef.path);
  const content = fs.existsSync(contentPath) ? readJson(contentPath) : null;
  const locale = recipe.locale || content?.defaultLocale || "zh-CN";

  const { before, node } = applyRecipeToNode(found.node, recipe, content, locale);

  let contentHash = null;
  if (fs.existsSync(contentPath)) {
    contentHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(contentPath))
      .digest("hex");
  }

  // Prefer recipeHash from compile report if present
  let recipeHash = null;
  const compileReportPath = path.join(reportsDir, "level_recipe_compile_latest.json");
  if (fs.existsSync(compileReportPath)) {
    try {
      const cr = readJson(compileReportPath);
      if (cr.recipeHash) recipeHash = cr.recipeHash;
      else if (Array.isArray(cr.results)) {
        const hit = cr.results.find((r) => r.recipeId === recipe.recipeId);
        if (hit?.recipeHash) recipeHash = hit.recipeHash;
      }
    } catch {
      /* ignore */
    }
  }

  const applied = {
    schemaVersion: "loreweaver.level-recipe-apply.v1",
    status: "passed",
    ok: true,
    createdAt: new Date().toISOString(),
    dryRun,
    workspaceId,
    nodeId: String(nodeId),
    nodePath: path.relative(loreRoot, found.path).split(path.sep).join("/"),
    recipeId: recipe.recipeId,
    recipePath: path.relative(loreRoot, recipePath).split(path.sep).join("/"),
    cardId: recipe.cardId,
    contentThemeId: content?.themeId || null,
    recipeHash,
    contentHash: contentHash ? contentHash.slice(0, 16) : null,
    contentHashFull: contentHash,
    before: {
      title: before.title,
      intro: before.intro,
      cardId: before.gameplay?.cardId || null,
      durationLimit: before.durationLimit,
      modifiers: (before.gameplay?.modifiers || []).map((m) => m.id || m),
      knobs: before.gameplay?.knobs || null
    },
    after: {
      title: node.title,
      intro: node.intro,
      cardId: node.gameplay.cardId,
      durationLimit: node.durationLimit,
      modifiers: (node.gameplay.modifiers || []).map((m) => m.id || m),
      knobs: node.gameplay.knobs || null
    },
    staleMarked: null
  };

  if (!dryRun) {
    fs.writeFileSync(found.path, `${JSON.stringify(node, null, 2)}\n`);
    if (markStale) {
      const stale = markGateReportsStale({
        reportsDir,
        reason: `level_recipe_apply:${recipe.recipeId}`,
        identity: {
          recipeId: recipe.recipeId,
          cardId: recipe.cardId,
          recipeHash,
          contentHash,
          workspaceId,
          nodeId: String(nodeId)
        }
      });
      applied.staleMarked = {
        count: stale.marked.length,
        files: stale.marked.map((m) => m.file),
        skipped: stale.skipped
      };
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const out = path.join(reportsDir, "level_recipe_apply_latest.json");
  fs.writeFileSync(out, `${JSON.stringify(applied, null, 2)}\n`);

  return applied;
}

export function listBundledRecipes(loreRoot = LORE_ROOT) {
  const dir = path.join(
    loreRoot,
    "minigame_master/gameplay/cards/fixtures/survivor_horde"
  );
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("level_recipe") && f.endsWith(".json"))
    .map((f) => {
      const p = path.join(dir, f);
      try {
        const r = readJson(p);
        return {
          recipeId: r.recipeId,
          cardId: r.cardId,
          path: path.relative(loreRoot, p).split(path.sep).join("/"),
          status: r.status || null,
          productionReady: Boolean(r.productionReady),
          contentPackRef: r.contentPackRef || null,
          balanceProfile: r.balanceProfile || null
        };
      } catch {
        return { path: path.relative(loreRoot, p).split(path.sep).join("/"), error: true };
      }
    });
}
