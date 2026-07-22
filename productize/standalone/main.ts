import "./standalone.css";
import { startLoreWeaverRuntime, LoreWeaverRuntimeHandle } from "../../src/runtime/LoreWeaverRuntimeKernel";
import { ResolvedRuntimeSpec } from "../../src/runtime/compileRuntimeSpec";
import { INITIAL_PLAYER_STATE, normalizePlayerState } from "../../src/runtime/playerState";
import { synth } from "../../src/utils/AudioSynth";

const shell = document.querySelector<HTMLElement>("#standalone-shell")!;
const container = document.querySelector<HTMLElement>("#game-container")!;
const status = document.querySelector<HTMLElement>("#boot-status")!;
const errorBox = document.querySelector<HTMLElement>("#runtime-error")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button")!;
const muteButton = document.querySelector<HTMLButtonElement>("#mute-button")!;
const retryButton = document.querySelector<HTMLButtonElement>("#retry-button")!;
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button")!;
const resetSaveButton = document.querySelector<HTMLButtonElement>("#reset-save-button")!;
const testStateOutput = document.querySelector<HTMLOutputElement>("#runtime-test-state")!;

let runtime: LoreWeaverRuntimeHandle | null = null;
let paused = false;
let muted = false;

function installLoopbackE2EControls() {
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  if (!loopback || new URLSearchParams(window.location.search).get("e2e") !== "1") return;
  const controls = document.createElement("aside");
  controls.id = "e2e-controls";
  controls.setAttribute("aria-label", "Runtime E2E controls");

  const addButton = (label: string, action: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    controls.appendChild(button);
  };

  addButton("E2E 技能升级", () => {
    const adapter = (window as any).__LW_SURVIVOR_DEMO__;
    if (!adapter?.state) return;
    adapter.state.score = Math.max(Number(adapter.state.score || 0), 4);
    adapter.publishTestState?.();
  });
  addButton("E2E 敌人攻击", () => {
    const adapter = (window as any).__LW_SURVIVOR_DEMO__;
    if (!adapter?.player) return;
    const enemy = adapter.spawnEnemy?.({ id: "e2e_attacker", hp: 999, speed: 0, damage: 7, radius: 12 });
    enemy?.setPosition?.(adapter.player.x, adapter.player.y);
    adapter.handlePlayerEnemyOverlap?.(adapter.player, enemy);
    enemy?.destroy?.();
    adapter.publishTestState?.();
  });
  addButton("E2E 成功结算", () => {
    const adapter = (window as any).__LW_SURVIVOR_DEMO__;
    adapter?.finish?.(true, "e2e_completed");
  });
  shell.appendChild(controls);
}

window.setInterval(() => {
  const hooks = (window as any).__LOREWEAVER_TEST_HOOKS__ || null;
  testStateOutput.textContent = JSON.stringify({
    runtimeVersion: shell.dataset.runtimeVersion || null,
    specHash: shell.dataset.specHash || null,
    lifecycle: shell.dataset.lifecycle || null,
    assetStatus: shell.dataset.assetStatus || null,
    hooks
  });
}, 200);

function readResolvedSpec(): ResolvedRuntimeSpec {
  const node = document.querySelector<HTMLScriptElement>("#loreweaver-runtime-spec");
  if (!node?.textContent?.trim()) throw new Error("Missing embedded resolved runtime spec");
  const parsed = JSON.parse(node.textContent) as ResolvedRuntimeSpec;
  if (parsed.schemaVersion !== "loreweaver.runtime-spec.v2" || !parsed.specHash || !parsed.gameSpec?.nodes?.length) {
    throw new Error("Embedded runtime spec is invalid or incomplete");
  }
  return parsed;
}

const resolvedSpec = readResolvedSpec();
const storageKey = `loreweaver_standalone_player_state:v1:${resolvedSpec.specHash}`;

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return normalizePlayerState(INITIAL_PLAYER_STATE);
  try {
    return normalizePlayerState(JSON.parse(raw));
  } catch {
    localStorage.removeItem(storageKey);
    status.textContent = "检测到损坏存档，已恢复默认进度。";
    return normalizePlayerState(INITIAL_PLAYER_STATE);
  }
}

function setError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  shell.setAttribute("aria-busy", "false");
  status.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = `启动失败：${message}`;
}

function boot() {
  runtime?.destroy();
  runtime = null;
  container.replaceChildren();
  errorBox.hidden = true;
  status.hidden = false;
  status.textContent = "正在启动共享运行时…";
  shell.setAttribute("aria-busy", "true");
  paused = false;
  pauseButton.textContent = "暂停";

  try {
    // Static mode is an explicit host signal used by the shared asset resolver path.
    (window as any).__LOREWEAVER_EMBEDDED_SPEC__ = resolvedSpec.gameSpec;
    runtime = startLoreWeaverRuntime(resolvedSpec, {
      container,
      hostKind: "standalone",
      initialPlayerState: loadState(),
      saveState: (state) => localStorage.setItem(storageKey, JSON.stringify(normalizePlayerState(state))),
      logger: (message) => console.info(`[LoreWeaver] ${message}`),
      onState: (diagnostics) => {
        shell.dataset.runtimeVersion = diagnostics.runtimeVersion;
        shell.dataset.specHash = diagnostics.specHash;
        shell.dataset.lifecycle = diagnostics.lifecycle;
        shell.dataset.assetStatus = diagnostics.assetStatus;
        if (diagnostics.lifecycle === "running") {
          shell.setAttribute("aria-busy", "false");
          status.textContent = `共享运行时 ${diagnostics.runtimeVersion} · ${diagnostics.specHash.slice(0, 19)}…`;
          window.setTimeout(() => { status.hidden = true; }, 1600);
        }
      }
    });
    window.setTimeout(() => {
      const artStatus = (window as any).__LOREWEAVER_ART_PIPELINE__?.status || "unknown";
      shell.dataset.assetStatus = artStatus;
    }, 2200);
  } catch (error) {
    setError(error);
  }
}

pauseButton.addEventListener("click", () => {
  if (!runtime) return;
  paused = !paused;
  for (const scene of runtime.game.scene.scenes) {
    if (paused && scene.scene.isActive()) scene.scene.pause();
    else if (!paused && scene.scene.isPaused()) scene.scene.resume();
  }
  pauseButton.textContent = paused ? "继续" : "暂停";
});

muteButton.addEventListener("click", () => {
  muted = !muted;
  synth.setMute(muted);
  if (runtime) runtime.game.sound.mute = muted;
  muteButton.textContent = muted ? "取消静音" : "静音";
});

retryButton.addEventListener("click", boot);
fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void shell.requestFullscreen();
});
resetSaveButton.addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  boot();
});

window.addEventListener("error", (event) => setError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => setError(event.reason));
installLoopbackE2EControls();
boot();
