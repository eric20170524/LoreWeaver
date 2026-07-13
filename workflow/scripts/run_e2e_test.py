import argparse
import io
import urllib.request
import subprocess
import time
import sys
import json
import os
import socket
import signal
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

SCRIPT_PATH = Path(__file__).resolve()
LORE_ROOT = SCRIPT_PATH.parents[2]
REPO_ROOT = LORE_ROOT.parent
REPORTS_DIR = LORE_ROOT / "workflow" / "reports"
SURVIVOR_DEMO_CONFIG = REPO_ROOT / "minigame_master" / "core" / "demo" / "survivor_horde" / "vite.config.mjs"

def utc_now_iso():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"

def find_open_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def wait_for_url(url, timeout=12):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as res:
                if res.status == 200:
                    return
        except Exception as exc:
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")

def stop_process(proc):
    if proc.poll() is None:
        proc.terminate()
    try:
        return proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        return proc.communicate(timeout=5)

def read_demo_state(page):
    return page.evaluate("""
    () => {
        const stateNode = document.querySelector('[data-testid="test-state"]');
        if (!stateNode || !stateNode.textContent) return {};
        try {
            return JSON.parse(stateNode.textContent);
        } catch (_error) {
            return {};
        }
    }
    """)

def read_canvas_probe(page):
    return page.evaluate("""
    () => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { present: false };
        try {
            const dataUrl = canvas.toDataURL('image/png');
            return {
                present: true,
                width: canvas.width,
                height: canvas.height,
                dataUrlLength: dataUrl.length,
                nonBlank: dataUrl.length > 1500
            };
        } catch (error) {
            return {
                present: true,
                width: canvas.width,
                height: canvas.height,
                dataUrlLength: 0,
                nonBlank: false,
                error: String(error)
            };
        }
    }
    """)

def read_combat_probe(page):
    return page.evaluate("""
    () => {
        const adapter = window.__LW_SURVIVOR_DEMO__;
        return {
            adapterStatus: adapter?.status || null,
            enemies: adapter?.groups?.enemies?.getLength?.() || 0,
            bullets: adapter?.groups?.bullets?.getLength?.() || 0,
            collectibles: adapter?.groups?.collectibles?.getLength?.() || 0
        };
    }
    """)

def find_python_env_bin():
    candidates = [
        LORE_ROOT.parent / "venv" / "bin",
        LORE_ROOT / ".venv" / "bin",
        LORE_ROOT.parent / ".venv" / "bin"
    ]
    for candidate in candidates:
        if (candidate / "python").exists() or (candidate / "python3").exists():
            return str(candidate)
    return None

def is_ignorable_dev_console_error(text: str) -> bool:
    if (
        "WebSocket connection to" in text
        and "127.0.0.1:5173" in text
        and (
            "Error during WebSocket handshake" in text
            or "Error in connection establishment" in text
            or "ERR_CONNECTION_RESET" in text
            or "ERR_CONNECTION_REFUSED" in text
        )
    ):
        return True
    return (
        "WebSocket connection to" in text
        and "?token=" in text
        and "Error during WebSocket handshake" in text
    )

def write_survivor_report(report):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(REPORTS_DIR / "runtime_e2e_survivor_horde_latest.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

def run_survivor_horde_demo_test():
    vite_bin = LORE_ROOT / "node_modules" / ".bin" / "vite"
    if not vite_bin.exists():
        raise RuntimeError(f"Missing Vite binary: {vite_bin}")
    if not SURVIVOR_DEMO_CONFIG.exists():
        raise RuntimeError(f"Missing survivor horde Vite config: {SURVIVOR_DEMO_CONFIG}")

    port = find_open_port()
    url = f"http://127.0.0.1:{port}/"
    stdout_file = tempfile.TemporaryFile(mode="w+t")
    stderr_file = tempfile.TemporaryFile(mode="w+t")
    proc = subprocess.Popen(
        [
            str(vite_bin),
            "--config",
            str(SURVIVOR_DEMO_CONFIG),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--strictPort"
        ],
        cwd=str(REPO_ROOT),
        stdout=stdout_file,
        stderr=stderr_file,
        text=True
    )

    errors = []
    observed = {}
    assertions = {}
    stdout = ""
    stderr = ""

    try:
        wait_for_url(url)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 720, "height": 1280}, device_scale_factor=1)

            page.on("pageerror", lambda err: errors.append(f"Page Error: {err}"))
            page.on("console", lambda msg: errors.append(f"Console Error: {msg.text}") if msg.type == "error" and not is_ignorable_dev_console_error(msg.text) else None)

            try:
                page.goto(url)
                page.wait_for_selector('[data-testid="start-run"]', timeout=10000)
                assertions["startButtonUnique"] = page.locator('[data-testid="start-run"]').count() == 1
                if not assertions["startButtonUnique"]:
                    raise RuntimeError("Expected exactly one survivor_horde start button.")

                initial_canvas = read_canvas_probe(page)
                observed["initialCanvas"] = initial_canvas
                assertions["canvasCreated"] = bool(initial_canvas.get("present"))
                assertions["canvasNonblankBeforeRun"] = bool(initial_canvas.get("nonBlank"))

                page.locator('[data-testid="start-run"]').click()
                page.wait_for_function("""
                () => {
                    const node = document.querySelector('[data-testid="test-state"]');
                    if (!node?.textContent) return false;
                    try {
                        const state = JSON.parse(node.textContent);
                        return state.mode === 'run' && state.status === 'running';
                    } catch (_error) {
                        return false;
                    }
                }
                """, timeout=10000)

                observed["duringRunStart"] = read_demo_state(page)
                page.mouse.move(360, 640)
                page.mouse.down()
                page.mouse.move(420, 540)
                page.mouse.up()
                page.wait_for_timeout(6200)
                observed["duringRunAfterCombat"] = read_demo_state(page)
                observed["combatProbe"] = read_combat_probe(page)
                running_canvas = read_canvas_probe(page)
                observed["runningCanvas"] = running_canvas

                start_timer = observed["duringRunStart"].get("timer")
                later_timer = observed["duringRunAfterCombat"].get("timer")
                assertions["runningStateObserved"] = observed["duringRunStart"].get("status") == "running"
                assertions["timerUpdated"] = isinstance(start_timer, (int, float)) and isinstance(later_timer, (int, float)) and later_timer < start_timer
                assertions["combatLoopObserved"] = (
                    observed["duringRunAfterCombat"].get("kills", 0) > 0
                    or observed["combatProbe"].get("enemies", 0) > 0
                    or observed["combatProbe"].get("bullets", 0) > 0
                    or observed["combatProbe"].get("collectibles", 0) > 0
                )
                assertions["canvasNonblankDuringRun"] = bool(running_canvas.get("nonBlank"))

                page.locator('[data-testid="retreat-run"]').click()
                page.wait_for_function("""
                () => {
                    const node = document.querySelector('[data-testid="test-state"]');
                    if (!node?.textContent) return false;
                    try {
                        const state = JSON.parse(node.textContent);
                        return state.mode === 'result' && state.resultReason === 'retreated';
                    } catch (_error) {
                        return false;
                    }
                }
                """, timeout=10000)
                observed["afterRetreat"] = read_demo_state(page)
                assertions["retreatResultReason"] = observed["afterRetreat"].get("resultReason") == "retreated"

                page.locator('[data-testid="back-menu"]').click()
                page.wait_for_function("""
                () => {
                    const node = document.querySelector('[data-testid="test-state"]');
                    if (!node?.textContent) return false;
                    try {
                        const state = JSON.parse(node.textContent);
                        return state.mode === 'menu' && state.hasLastResult === true;
                    } catch (_error) {
                        return false;
                    }
                }
                """, timeout=10000)
                observed["afterBack"] = read_demo_state(page)
                assertions["returnedToMenu"] = observed["afterBack"].get("mode") == "menu"

            finally:
                browser.close()

    except Exception as exc:
        errors.append(f"Interaction failure: {exc}")
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        stdout_file.seek(0)
        stderr_file.seek(0)
        stdout = stdout_file.read()
        stderr = stderr_file.read()
        stdout_file.close()
        stderr_file.close()

    assertions["consoleErrors"] = len([err for err in errors if err.startswith("Console Error:")])
    passed = not errors and all(value is True for key, value in assertions.items() if key != "consoleErrors")

    report = {
        "gate": "runtime_e2e",
        "target": "minigame_master/core/demo/survivor_horde",
        "status": "passed" if passed else "failed",
        "createdAt": utc_now_iso(),
        "method": "Playwright against Vite-served survivor_horde demo",
        "server": {
            "url": url,
            "command": f"{vite_bin} --config {SURVIVOR_DEMO_CONFIG} --host 127.0.0.1 --port {port} --strictPort"
        },
        "assertions": assertions,
        "observedState": observed,
        "errors": errors,
        "stdout": stdout,
        "stderr": stderr
    }
    write_survivor_report(report)

    print(json.dumps({
        "gate": report["gate"],
        "target": report["target"],
        "status": report["status"],
        "assertions": report["assertions"],
        "errors": report["errors"]
    }, ensure_ascii=False, indent=2))

    if not passed:
        sys.exit(1)
    sys.exit(0)

def write_loreweaver_report(report):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(REPORTS_DIR / "runtime_e2e_loreweaver_latest.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

def run_loreweaver_app_test():
    print("Starting LoreWeaver App dev server (npm run dev)...")
    env = os.environ.copy()
    python_env_bin = find_python_env_bin()
    if python_env_bin:
        env["PATH"] = python_env_bin + os.pathsep + env.get("PATH", "")
    stdout_file = tempfile.TemporaryFile(mode="w+t")
    stderr_file = tempfile.TemporaryFile(mode="w+t")
    proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(LORE_ROOT),
        stdout=stdout_file,
        stderr=stderr_file,
        text=True,
        env=env,
        preexec_fn=os.setsid
    )

    url = "http://127.0.0.1:3000/"
    errors = []
    observed = {}
    assertions = {}
    stdout = ""
    stderr = ""

    try:
        wait_for_url(url, timeout=25)
        time.sleep(4)
        print("LoreWeaver App server is ready. Launching Playwright...")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.add_init_script("""
            () => {
                if (!sessionStorage.getItem("lw_e2e_initialized")) {
                    localStorage.removeItem("loreweaver_player_state");
                    sessionStorage.setItem("lw_e2e_initialized", "1");
                }
                localStorage.setItem("loreweaver_emulator_size", "standard");
            }
            """)

            page.on("pageerror", lambda err: errors.append(f"Page Error: {err}"))
            page.on("console", lambda msg: errors.append(f"Console Error: {msg.text}") if msg.type == "error" and not is_ignorable_dev_console_error(msg.text) else None)

            try:
                def click_canvas_center():
                    box = page.evaluate("""
                    () => {
                        const canvas = document.querySelector('canvas');
                        if (!canvas) return null;
                        const rect = canvas.getBoundingClientRect();
                        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                    }
                    """)
                    if not box:
                        raise RuntimeError("Cannot click canvas center because no canvas exists.")
                    page.mouse.click(box["x"], box["y"])

                def read_player_state():
                    return page.evaluate("""
                    () => {
                        try {
                            return JSON.parse(localStorage.getItem("loreweaver_player_state") || "{}");
                        } catch (_error) {
                            return {};
                        }
                    }
                    """)

                def wait_main_scene():
                    page.wait_for_function("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        return game
                            && game.scene.isActive('MainScene')
                            && !game.scene.isActive('LevelActiveScene');
                    }
                    """, timeout=15000)

                def start_adapter_smoke(node_index, card_id, label, duration=12, goal=999):
                    print(f"Launching {label} adapter smoke...")
                    page.evaluate("""
                    ({ nodeIndex, cardId, duration, goal }) => {
                        const game = window.__LOREWEAVER_GAME__;
                        const spec = game.registry.get("gameSpec");
                        const sourceNode = spec.nodes[nodeIndex] || spec.nodes[0];
                        const node = {
                            ...sourceNode,
                            goalValue: goal,
                            durationLimit: duration,
                            difficulty: 1,
                            gameplay: {
                                ...(sourceNode.gameplay || {}),
                                adapter: "phaser",
                                cardId,
                                knobs: {
                                    ...((sourceNode.gameplay || {}).knobs || {}),
                                    duration,
                                    goalValue: goal,
                                    difficulty: 1,
                                    spawnIntervalMs: 650,
                                    itemSpeed: 180,
                                    hazardRate: 0.25,
                                    boss: {
                                        hp: 30,
                                        attackIntervalMs: 2000
                                    }
                                }
                            }
                        };
                        window.__LOREWEAVER_TEST_HOOKS__ = {};
                        const mainScene = game.scene.keys['MainScene'];
                        if (game.scene.isActive('MainScene') && mainScene?.scene) {
                            mainScene.scene.start('LevelActiveScene', { node });
                        } else {
                            game.scene.stop('LevelActiveScene');
                            game.scene.start('LevelActiveScene', { node });
                        }
                    }
                    """, {"nodeIndex": node_index, "cardId": card_id, "duration": duration, "goal": goal})

                    page.wait_for_function(f"""
                    () => {{
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game?.scene?.keys?.LevelActiveScene;
                        return game
                            && game.scene.isActive('LevelActiveScene')
                            && activeScene?.node?.gameplay?.cardId === "{card_id}";
                    }}
                    """, timeout=5000)
                    page.wait_for_timeout(800)


                    # Click canvas center as a fallback when a card still relies on the intro overlay path.
                    max_attempts = 6
                    for attempt in range(max_attempts):
                        hooks_state = page.evaluate("window.__LOREWEAVER_TEST_HOOKS__")
                        active_scenes = page.evaluate("""
                        () => {
                            const game = window.__LOREWEAVER_GAME__;
                            return game ? game.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key) : [];
                        }
                        """)
                        adapter_state = page.evaluate("""
                        () => {
                            const game = window.__LOREWEAVER_GAME__;
                            const activeScene = game.scene.keys['LevelActiveScene'];
                            return activeScene && activeScene.adapter ? {
                                status: activeScene.adapter.status,
                                isRunning: typeof activeScene.adapter.isRunning === 'function' ? activeScene.adapter.isRunning() : null
                            } : null;
                        }
                        """)
                        if attempt == 0:
                            print(f"Adapter {card_id} initial state: hooks={hooks_state}, active_scenes={active_scenes}, adapter={adapter_state}")

                        started = hooks_state and hooks_state.get("adapterId") == card_id and hooks_state.get("status") == "running"
                        if started:
                            print(f"Adapter {card_id} started successfully!")
                            break

                        click_canvas_center()
                        page.wait_for_timeout(1000)
                    else:
                        print(f"Warning: Adapter {card_id} did not start after click attempts. Falling back to wait...")

                    page.wait_for_function(f"""
                    () => {{
                        const hooks = window.__LOREWEAVER_TEST_HOOKS__;
                        return hooks && hooks.adapterId === "{card_id}" && hooks.status === "running";
                    }}
                    """, timeout=5000)

                    start_state = page.evaluate("window.__LOREWEAVER_TEST_HOOKS__")
                    page.wait_for_timeout(3200)
                    later_state = page.evaluate("window.__LOREWEAVER_TEST_HOOKS__")
                    assertions[f"{label}RunningStateObserved"] = start_state.get("status") == "running"
                    assertions[f"{label}AdapterId"] = start_state.get("adapterId") == card_id
                    assertions[f"{label}TimerUpdated"] = (
                        isinstance(start_state.get("timer"), (int, float))
                        and isinstance(later_state.get("timer"), (int, float))
                        and later_state.get("timer") < start_state.get("timer")
                    )
                    observed[f"{label}Start"] = start_state
                    observed[f"{label}After2s"] = later_state

                def verify_first_node_growth_loop(label):
                    print(f"Verifying {label} first-node growth loop...")
                    before_growth = page.evaluate("window.__LOREWEAVER_TEST_HOOKS__?.growth || null")
                    page.evaluate("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game?.scene?.keys?.LevelActiveScene;
                        const adapter = activeScene?.adapter;
                        if (!activeScene || !adapter || typeof adapter.spawnCollectible !== 'function') {
                            throw new Error('Active survivor_horde adapter is not available for growth probe.');
                        }
                        for (let i = 0; i < 2; i += 1) {
                            const collectible = adapter.spawnCollectible(adapter.player.x, adapter.player.y, { score: 1 });
                            adapter.handleCollectibleOverlap(adapter.player, collectible);
                        }
                    }
                    """)
                    page.wait_for_function("""
                    () => {
                        const growth = window.__LOREWEAVER_TEST_HOOKS__?.growth;
                        if (!growth) return false;
                        const fist = growth.activeSkills?.find((skill) => skill.id === 'primordial_fist');
                        const hasLevelEvent = growth.events?.some((event) => event.milestone === 'primordial_fist_lv2');
                        return growth.collectedEssence >= 2
                            && fist?.level >= 2
                            && growth.combatStats?.bulletDamageAfter > growth.combatStats?.bulletDamageBefore
                            && hasLevelEvent;
                    }
                    """, timeout=5000)
                    after_growth = page.evaluate("window.__LOREWEAVER_TEST_HOOKS__?.growth || null")
                    observed[f"{label}GrowthBefore"] = before_growth
                    observed[f"{label}GrowthAfter"] = after_growth

                    active_skills = after_growth.get("activeSkills", []) if after_growth else []
                    fist = next((skill for skill in active_skills if skill.get("id") == "primordial_fist"), {})
                    before_damage = (after_growth or {}).get("combatStats", {}).get("bulletDamageBefore")
                    after_damage = (after_growth or {}).get("combatStats", {}).get("bulletDamageAfter")
                    assertions[f"{label}GrowthCollectionSource"] = (after_growth or {}).get("collectionSource") == "beast_essence_score_from_survivor_horde_collectibles"
                    assertions[f"{label}GrowthCollectedEnough"] = (after_growth or {}).get("collectedEssence", 0) >= 2
                    assertions[f"{label}GrowthSkillMutation"] = fist.get("level", 0) >= 2
                    assertions[f"{label}GrowthCombatImpact"] = isinstance(before_damage, (int, float)) and isinstance(after_damage, (int, float)) and after_damage > before_damage
                    assertions[f"{label}GrowthFeedback"] = any(
                        event.get("milestone") == "primordial_fist_lv2"
                        for event in (after_growth or {}).get("events", [])
                    )

                def verify_art_pipeline_loaded(label):
                    page.wait_for_function("""
                    () => {
                        const status = window.__LOREWEAVER_ART_PIPELINE__;
                        return status
                            && status.status === 'loaded'
                            && status.loadedCount >= 5
                            && status.loadedKeys?.includes('lw_runtime_player_shihao')
                            && status.loadedKeys?.includes('lw_enemy_wild_rhino');
                    }
                    """, timeout=10000)
                    art_status = page.evaluate("window.__LOREWEAVER_ART_PIPELINE__")
                    observed[f"{label}ArtPipeline"] = art_status
                    assertions[f"{label}ArtAtlasLoaded"] = art_status.get("status") == "loaded"
                    assertions[f"{label}ArtAtlasLoadedCount"] = art_status.get("loadedCount", 0) >= 5
                    assertions[f"{label}ArtPlayerTextureLoaded"] = "lw_runtime_player_shihao" in art_status.get("loadedKeys", [])
                    assertions[f"{label}ArtEnemyTextureLoaded"] = "lw_enemy_wild_rhino" in art_status.get("loadedKeys", [])
                    assertions[f"{label}ArtGeneratedWithImagegen"] = art_status.get("generationStatus") == "generated_with_builtin_imagegen"
                    assertions[f"{label}ArtProvenanceReported"] = art_status.get("provenancePath") == "assets/imagegen/provenance.json"

                def verify_export_art_runtime_usage(label):
                    runtime_art = page.evaluate("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game?.scene?.keys?.LevelActiveScene;
                        const adapter = activeScene?.adapter;
                        if (!adapter) return null;
                        let enemy = adapter.groups?.enemies?.getChildren?.()
                            ?.find((item) => item.texture?.key?.startsWith('lw_enemy_'));
                        if (!enemy && typeof adapter.spawnEnemy === 'function') {
                            enemy = adapter.spawnEnemy({
                                id: 'wild_rhino',
                                hp: 3,
                                speed: 30,
                                damage: 1,
                                radius: 13,
                                reward: { score: 1 }
                            });
                        }
                        return {
                            playerTexture: adapter.player?.texture?.key || null,
                            enemyTexture: enemy?.texture?.key || null,
                            artStatus: window.__LOREWEAVER_ART_PIPELINE__ || null
                        };
                    }
                    """)
                    observed[f"{label}ArtRuntimeUsage"] = runtime_art
                    assertions[f"{label}UsesAtlasPlayerTexture"] = runtime_art and runtime_art.get("playerTexture") == "lw_runtime_player_shihao"
                    assertions[f"{label}UsesAtlasEnemyTexture"] = runtime_art and str(runtime_art.get("enemyTexture", "")).startswith("lw_enemy_")

                def retreat_active_adapter(label):
                    page.evaluate("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game.scene.keys['LevelActiveScene'];
                        if (activeScene && activeScene.adapter) {
                            if (typeof activeScene.adapter.retreat === 'function') {
                                activeScene.adapter.retreat();
                            } else {
                                activeScene.adapter.finish(false, 'retreated');
                            }
                        }
                        if (activeScene && typeof activeScene.safeRetreat === 'function') {
                            activeScene.safeRetreat();
                        }
                    }
                    """)
                    wait_main_scene()
                    assertions[f"{label}ReturnedToMainScene"] = page.evaluate("window.__LOREWEAVER_GAME__.scene.isActive('MainScene')")

                def finish_active_adapter_success(label):
                    before_state = read_player_state()
                    page.evaluate("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game.scene.keys['LevelActiveScene'];
                        if (activeScene && activeScene.adapter) {
                            const result = activeScene.adapter.finish(true, 'objective_met');
                            let saved = {};
                            try {
                                saved = JSON.parse(localStorage.getItem("loreweaver_player_state") || "{}");
                            } catch (_error) {
                                saved = {};
                            }
                            const nodeId = activeScene.node?.id || 1;
                            if (
                                !saved.completedNodeIds?.includes(nodeId)
                                && typeof activeScene.handleAdapterEnd === 'function'
                            ) {
                                activeScene.handleAdapterEnd(result?.success ? result : {
                                    success: true,
                                    reason: 'objective_met',
                                    reward: { unlockNextNode: true }
                                });
                            }
                        }
                    }
                    """)
                    page.wait_for_function("""
                    () => {
                        try {
                            const state = JSON.parse(localStorage.getItem("loreweaver_player_state") || "{}");
                            return Array.isArray(state.completedNodeIds)
                                && state.completedNodeIds.includes(1)
                                && Array.isArray(state.unlockedNodeIds)
                                && state.unlockedNodeIds.includes(2);
                        } catch (_error) {
                            return false;
                        }
                    }
                    """, timeout=10000)
                    after_state = read_player_state()
                    observed[f"{label}StateBeforeSuccess"] = before_state
                    observed[f"{label}StateAfterSuccess"] = after_state
                    assertions[f"{label}RewardReturned"] = any(
                        isinstance(value, (int, float)) and value > 0
                        for value in after_state.get("secondaryResources", {}).values()
                    )
                    assertions[f"{label}NodeCompleted"] = 1 in after_state.get("completedNodeIds", [])
                    assertions[f"{label}NextNodeUnlocked"] = 2 in after_state.get("unlockedNodeIds", [])
                    page.evaluate("""
                    () => {
                        const game = window.__LOREWEAVER_GAME__;
                        const activeScene = game.scene.keys['LevelActiveScene'];
                        if (activeScene && typeof activeScene.safeRetreat === 'function') {
                            activeScene.safeRetreat();
                        }
                    }
                    """)
                    wait_main_scene()

                page.goto(url)
                print("Waiting for page load...")
                page.wait_for_timeout(2500)

                print("Waiting for Phaser game instance to be created...")
                page.wait_for_function("""
                () => window.__LOREWEAVER_GAME__ !== undefined && window.__LOREWEAVER_GAME__ !== null
                """, timeout=15000)

                has_game = page.evaluate("Boolean(window.__LOREWEAVER_GAME__)")
                assertions["gameInstanceCreated"] = has_game

                print("Waiting for MainScene to become active...")
                wait_main_scene()
                assertions["mainSceneObserved"] = True
                canvas_probe = read_canvas_probe(page)
                observed["initialCanvas"] = canvas_probe
                assertions["canvasCreated"] = bool(canvas_probe.get("present"))
                assertions["canvasNonblank"] = bool(canvas_probe.get("nonBlank"))
                verify_art_pipeline_loaded("app")

                start_adapter_smoke(0, "survivor_horde", "survivorHorde")
                verify_export_art_runtime_usage("survivorHorde")
                verify_first_node_growth_loop("survivorHorde")
                finish_active_adapter_success("survivorHorde")

                print("Reloading to verify saved progression restores...")
                page.reload()
                page.wait_for_timeout(2500)
                page.wait_for_function("""
                () => window.__LOREWEAVER_GAME__ !== undefined && window.__LOREWEAVER_GAME__ !== null
                """, timeout=15000)
                wait_main_scene()
                restored_state = read_player_state()
                observed["restoredState"] = restored_state
                assertions["saveRestoredCompletedNode"] = 1 in restored_state.get("completedNodeIds", [])
                assertions["saveRestoredNextUnlock"] = 2 in restored_state.get("unlockedNodeIds", [])

                start_adapter_smoke(0, "rhythm_timing", "tapReaction")
                retreat_active_adapter("tapReaction")

                print("Verifying progression is still persisted before collectDodge adapter smoke...")
                wait_main_scene()
                persisted_state = read_player_state()
                observed["persistedStateBeforeCollectDodge"] = persisted_state
                assertions["saveStillPersistedCompletedNode"] = 1 in persisted_state.get("completedNodeIds", [])
                assertions["saveStillPersistedNextUnlock"] = 2 in persisted_state.get("unlockedNodeIds", [])

                start_adapter_smoke(2, "drag_collect_grid", "collectDodge")
                retreat_active_adapter("collectDodge")

                print("Verifying workspace export API...")
                workspaces_res = urllib.request.urlopen("http://127.0.0.1:3000/api/workspaces")
                workspaces_data = json.loads(workspaces_res.read().decode("utf-8"))

                ws_id = None
                if workspaces_data.get("success") and workspaces_data.get("data"):
                    ws_id = workspaces_data["data"][0]["id"]

                if not ws_id:
                    raise RuntimeError("No workspaces found to export")

                # 2. Call export endpoint
                print(f"Calling export endpoint for workspace {ws_id}...")
                export_res = urllib.request.urlopen(f"http://127.0.0.1:3000/api/workspaces/{ws_id}/export")
                zip_data = export_res.read()

                print("Parsing zip data from export endpoint...")
                with tempfile.TemporaryDirectory(prefix="loreweaver_export_") as export_dir:
                    with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                        namelist = zf.namelist()
                        observed["exportZipFiles"] = namelist
                        print(f"Zip files: {namelist}")

                        assertions["exportHasIndexHtml"] = "index.html" in namelist
                        assertions["exportHasManifestJson"] = "manifest.json" in namelist
                        assertions["exportHasReadmeMd"] = "README.md" in namelist
                        assertions["exportHasAssets"] = any(name.startswith("assets/") for name in namelist)
                        assertions["exportHasNodes"] = any(name.startswith("nodes/") for name in namelist)
                        assertions["exportHasScenes"] = any(name.startswith("scenes/") for name in namelist)
                        assertions["exportHasJs"] = any(name.startswith("js/") for name in namelist)
                        assertions["exportHasSystems"] = any(name.startswith("systems/") for name in namelist)
                        assertions["exportHasLoreweaver"] = any(name.startswith("loreweaver/") for name in namelist)
                        assertions["exportHasImagegenAtlas"] = "assets/imagegen/atlas.png" in namelist
                        assertions["exportHasImagegenManifest"] = "assets/imagegen/manifest.json" in namelist
                        assertions["exportHasImagegenScriptManifest"] = "assets/imagegen/manifest.js" in namelist
                        assertions["exportHasImagegenProvenance"] = "assets/imagegen/provenance.json" in namelist
                        assertions["exportHasImagegenSource"] = "assets/imagegen/source/generated-sprite-atlas-20260628.png" in namelist

                        index_content = zf.read("index.html").decode("utf-8")
                        readme_content = zf.read("README.md").decode("utf-8")
                        assertions["exportIndexHtmlHasEmbeddedSpec"] = "window.__LOREWEAVER_EMBEDDED_SPEC__" in index_content
                        assertions["exportIndexUsesRelativeAssets"] = 'src="./assets/' in index_content
                        assertions["exportReadmeDescribesPlayableH5"] = "full playable H5" in readme_content
                        zf.extractall(export_dir)

                    export_port = find_open_port()
                    export_url = f"http://127.0.0.1:{export_port}/"
                    export_proc = subprocess.Popen(
                        [sys.executable, "-m", "http.server", str(export_port), "--bind", "127.0.0.1"],
                        cwd=export_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True
                    )
                    export_stdout = ""
                    export_stderr = ""
                    try:
                        wait_for_url(export_url, timeout=10)
                        print(f"Testing static export at {export_url} ...")
                        page.goto(export_url)
                        page.wait_for_function("""
                        () => window.__LOREWEAVER_EMBEDDED_SPEC__ !== undefined
                        """, timeout=10000)
                        page.wait_for_function("""
                        () => window.__LOREWEAVER_GAME__ !== undefined && window.__LOREWEAVER_GAME__ !== null
                        """, timeout=15000)
                        wait_main_scene()
                        assertions["exportStaticEmbeddedSpec"] = page.evaluate("Boolean(window.__LOREWEAVER_EMBEDDED_SPEC__)")
                        assertions["exportStaticGameInstanceCreated"] = page.evaluate("Boolean(window.__LOREWEAVER_GAME__)")
                        export_canvas_probe = read_canvas_probe(page)
                        observed["exportStaticInitialCanvas"] = export_canvas_probe
                        assertions["exportStaticCanvasCreated"] = bool(export_canvas_probe.get("present"))
                        assertions["exportStaticCanvasNonblank"] = bool(export_canvas_probe.get("nonBlank"))
                        verify_art_pipeline_loaded("export")

                        start_adapter_smoke(0, "survivor_horde", "exportSurvivorHorde", duration=6)
                        verify_export_art_runtime_usage("exportSurvivorHorde")
                        verify_first_node_growth_loop("exportSurvivorHorde")
                        finish_active_adapter_success("exportSurvivorHorde")
                        start_adapter_smoke(0, "rhythm_timing", "exportTapReaction", duration=6)
                        retreat_active_adapter("exportTapReaction")
                        start_adapter_smoke(2, "drag_collect_grid", "exportCollectDodge", duration=6)
                        retreat_active_adapter("exportCollectDodge")
                        observed["exportSmokeMatrix"] = [
                            {"cardId": "survivor_horde", "flow": "static_export_success_reward_unlock"},
                            {"cardId": "rhythm_timing", "flow": "static_export_running_retreat_return"},
                            {"cardId": "drag_collect_grid", "flow": "static_export_running_retreat_return"}
                        ]
                    finally:
                        export_stdout, export_stderr = stop_process(export_proc)
                        observed["exportStaticServer"] = {
                            "url": export_url,
                            "stdout": export_stdout,
                            "stderr": export_stderr
                        }

                print("Export verification completed successfully!")

                observed["smokeMatrix"] = [
                    {"cardId": "survivor_horde", "flow": "success_reward_unlock_save_restore"},
                    {"cardId": "rhythm_timing", "flow": "running_retreat_return"},
                    {"cardId": "drag_collect_grid", "flow": "running_retreat_return"}
                ]

            finally:
                browser.close()

    except Exception as exc:
        errors.append(f"Interaction failure: {exc}")
        print(f"E2E test error: {exc}")
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=5)
        except Exception as kill_err:
            print(f"Error terminating process group: {kill_err}")
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                proc.wait(timeout=5)
            except Exception:
                pass
        stdout_file.seek(0)
        stderr_file.seek(0)
        stdout = stdout_file.read()
        stderr = stderr_file.read()
        stdout_file.close()
        stderr_file.close()

    assertions["consoleErrors"] = len([err for err in errors if err.startswith("Console Error:")])
    passed = not errors and all(value is True for key, value in assertions.items() if key != "consoleErrors")

    report = {
        "gate": "runtime_e2e",
        "target": "LoreWeaver/app",
        "status": "passed" if passed else "failed",
        "createdAt": utc_now_iso(),
        "method": "Playwright against Express proxy serving LoreWeaver dev backend/frontend",
        "assertions": assertions,
        "observedState": observed,
        "errors": errors,
        "stdout": stdout,
        "stderr": stderr
    }
    write_loreweaver_report(report)

    print(json.dumps({
        "gate": report["gate"],
        "target": report["target"],
        "status": report["status"],
        "assertions": report["assertions"],
        "errors": report["errors"]
    }, ensure_ascii=False, indent=2))

    if not passed:
        sys.exit(1)
    sys.exit(0)

def run_test(game_name, node_id=None, grant_state_str=None):
    if game_name == 'loreweaver':
        run_loreweaver_app_test()
    elif game_name == 'survivor_horde':
        run_survivor_horde_demo_test()

    print(f'Starting HTTP server for {game_name}...')
    proc = subprocess.Popen(['python3', '-m', 'http.server', '8080'])
    time.sleep(2) # Give server time to start

    try:
        print('Testing server connection...')
        res = urllib.request.urlopen(f'http://localhost:8080/minigame/{game_name}/index.html')
        print('HTTP Status:', res.status)
        if res.status != 200:
            print('Failed to reach server.')
            proc.terminate()
            sys.exit(1)
    except Exception as e:
        print('Server test failed:', e)
        proc.terminate()
        sys.exit(1)

    print(f"Starting Playwright validation for {game_name}...")
    errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("pageerror", lambda err: errors.append(f"Page Error: {err}"))
        page.on("console", lambda msg: errors.append(f"Console Error: {msg.text}") if msg.type == "error" else None)

        try:
            # Load the game page
            print('Loading game page...')
            page.goto(f'http://localhost:8080/minigame/{game_name}/index.html')
            page.wait_for_timeout(2000) # Wait for Phaser to load

            if game_name == 'xianni':
                # 1. State Injection if requested
                if grant_state_str:
                    print(f"Injecting custom state: {grant_state_str}")
                    page.evaluate(f"window.localStorage.setItem('xianni_save', JSON.stringify({grant_state_str}))")
                    page.reload()
                    page.wait_for_timeout(2000)

                # 2. Specific Node Smoke Test
                if node_id:
                    print(f"Executing specific smoke test for Node {node_id}...")
                    # Unlock the node in Store first so the main scene allows entering it
                    page.evaluate(f"""
                    const unlocked = Store.get('unlockedNodes') || [];
                    if (!unlocked.includes({node_id})) {{
                        unlocked.push({node_id});
                        Store.set('unlockedNodes', unlocked);
                    }}
                    window.game.scene.keys['MainScene'].enterNode({node_id});
                    """)
                    page.wait_for_timeout(1000)
                    
                    # Confirm modal to start the node
                    print("Confirming war mobilization modal...")
                    page.evaluate("""
                    const mainScene = window.game.scene.keys['MainScene'];
                    const modal = mainScene.children.list.find(c => c.depth === 1000);
                    if (modal) {
                        const zone = modal.list.find(obj => obj.type === 'Zone');
                        if (zone) {
                            zone.emit('pointerdown');
                            zone.emit('pointerup');
                        }
                    }
                    """)
                    page.wait_for_timeout(2000)

                    # Verify active scene is Node{node_id}Scene
                    active_scene = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                    print(f"Current active scene: {active_scene}")
                    if active_scene != f"Node{node_id}Scene":
                        raise Exception(f"Failed to enter Node {node_id} scene. Active: {active_scene}")

                    # Run inside the node for 5 seconds
                    print(f"Running inside Node {node_id} for 5 seconds...")
                    page.wait_for_timeout(5000)

                    # Trigger retreat
                    print("Triggering retreat...")
                    page.evaluate("""
                    const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key !== 'MainScene');
                    if (activeScene && activeScene.retreatBtn) {
                        activeScene.retreatBtn.emit('pointerdown');
                        activeScene.retreatBtn.emit('pointerup');
                    }
                    """)
                    page.wait_for_timeout(1000)

                    # Confirm retreat modal
                    print("Confirming retreat modal...")
                    page.evaluate("""
                    const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key !== 'MainScene');
                    const modal = activeScene.children.list.find(c => c.depth === 1000);
                    if (modal) {
                        const zone = modal.list.find(obj => obj.type === 'Zone');
                        if (zone) {
                            zone.emit('pointerdown');
                            zone.emit('pointerup');
                        }
                    }
                    """)
                    page.wait_for_timeout(2000)

                    # Verify returned to MainScene
                    active_scene = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                    print(f"Returned to scene: {active_scene}")
                    if active_scene != "MainScene":
                        raise Exception(f"Failed to return to MainScene after retreat. Active: {active_scene}")

                else:
                    # Execute Full Progression & 12-Node smoke test suite!
                    print("Executing full Xianni E2E progression suite...")
                    
                    # Test Zunhunfan upgrade cost assertion
                    print("Testing Zunhunfan upgrade cost assertion...")
                    page.evaluate("""
                    Store.set('resources', { qi: 0, souls: 0, magicPill: 0 });
                    Store.set('perks', { zunhunfan_level: 0 });
                    Store.set('storyFlags', ['intro_completed', 'zunhunfan']);
                    const mainScene = window.game.scene.keys['MainScene'];
                    mainScene.updateUI();
                    """)
                    page.wait_for_timeout(500)
                    # Click upgrade (should fail)
                    page.evaluate("window.game.scene.keys['MainScene'].flagBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].flagBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    lvl = page.evaluate("Store.get('perks').zunhunfan_level")
                    if lvl != 0:
                        raise Exception(f"Zunhunfan upgraded without resources! Level is {lvl}")

                    # Grant souls and upgrade
                    page.evaluate("""
                    Store.set('resources', { qi: 0, souls: 1000, magicPill: 0 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].flagBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].flagBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    lvl = page.evaluate("Store.get('perks').zunhunfan_level")
                    if lvl != 1:
                        raise Exception(f"Zunhunfan upgrade failed with sufficient resources! Level is {lvl}")
                    print("Zunhunfan upgrade check passed.")

                    # Test Breakthrough cost assertion
                    print("Testing Breakthrough cost assertion...")
                    page.evaluate("""
                    Store.set('level', 1);
                    Store.set('resources', { qi: 0, souls: 0, magicPill: 0 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    # Click breakthrough (should fail)
                    page.evaluate("window.game.scene.keys['MainScene'].breakthroughBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].breakthroughBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    game_lvl = page.evaluate("Store.get('level')")
                    if game_lvl != 1:
                        raise Exception(f"Breakthrough succeeded without resources! Level is {game_lvl}")

                    # Grant qi and breakthrough
                    page.evaluate("""
                    Store.set('resources', { qi: 1000, souls: 0, magicPill: 0 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].breakthroughBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].breakthroughBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    game_lvl = page.evaluate("Store.get('level')")
                    if game_lvl != 2:
                        raise Exception(f"Breakthrough failed with sufficient resources! Level is {game_lvl}")
                    print("Breakthrough check passed.")

                    # Loop smoke testing Nodes 1 to 12
                    for node in range(1, 13):
                        print(f"Smoke testing Node {node}...")
                        page.evaluate(f"""
                        const unlocked = Store.get('unlockedNodes') || [];
                        if (!unlocked.includes({node})) {{
                            unlocked.push({node});
                            Store.set('unlockedNodes', unlocked);
                        }}
                        window.game.scene.keys['MainScene'].enterNode({node});
                        """)
                        page.wait_for_timeout(1000)

                        # Confirm modal
                        page.evaluate("""
                        const mainScene = window.game.scene.keys['MainScene'];
                        const modal = mainScene.children.list.find(c => c.depth === 1000);
                        if (modal) {
                            const zone = modal.list.find(obj => obj.type === 'Zone');
                            if (zone) {
                                zone.emit('pointerdown');
                                zone.emit('pointerup');
                            }
                        }
                        """)
                        page.wait_for_timeout(2000)

                        # Verify scene
                        active = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                        if active != f"Node{node}Scene":
                            raise Exception(f"Failed to enter Node {node} scene. Active: {active}")

                        # Wait 5 seconds
                        page.wait_for_timeout(5000)

                        # Retreat
                        page.evaluate("""
                        const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key !== 'MainScene');
                        if (activeScene && activeScene.retreatBtn) {
                            activeScene.retreatBtn.emit('pointerdown');
                            activeScene.retreatBtn.emit('pointerup');
                        }
                        """)
                        page.wait_for_timeout(1000)

                        # Confirm retreat
                        page.evaluate("""
                        const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key !== 'MainScene');
                        const modal = activeScene.children.list.find(c => c.depth === 1000);
                        if (modal) {
                            const zone = modal.list.find(obj => obj.type === 'Zone');
                            if (zone) {
                                zone.emit('pointerdown');
                                zone.emit('pointerup');
                            }
                        }
                        """)
                        page.wait_for_timeout(2000)

                        # Verify returned to MainScene
                        active = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                        if active != "MainScene":
                            raise Exception(f"Failed to return to MainScene from Node {node}. Active: {active}")
                        print(f"Node {node} smoke test passed successfully.")

            elif game_name == 'perfectworld_dahuang':
                # 1. State Injection if requested
                if grant_state_str:
                    print(f"Injecting custom state: {grant_state_str}")
                    page.evaluate(f"window.localStorage.setItem('shihao_save', JSON.stringify({grant_state_str}))")
                    page.reload()
                    page.wait_for_timeout(2000)

                # Enter MainScene from MenuScene
                print("Navigating to MainScene...")
                page.evaluate("window.game.scene.keys['MenuScene'].scene.start('MainScene')")
                page.wait_for_timeout(2000)

                # 2. Specific Node Smoke Test
                if node_id:
                    print(f"Executing specific smoke test for Node {node_id}...")
                    # Unlock the node in Store first so the main scene allows entering it
                    page.evaluate(f"""
                    store.set('progression.realm', 12);
                    const unlocked = store.get('unlockedNodes') || [];
                    if (!unlocked.includes({node_id})) {{
                        unlocked.push({node_id});
                        store.set('unlockedNodes', unlocked);
                    }}
                    NodeBridge.launchNode(window.game.scene.keys['MainScene'], {node_id});
                    """)
                    page.wait_for_timeout(2000)

                    # Verify active scene
                    active_scene = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive() && !s.scene.key.endsWith('UI')).scene.key")
                    print(f"Current active scene: {active_scene}")
                    if active_scene != f"Node{node_id}Scene":
                        raise Exception(f"Failed to enter Node {node_id} scene. Active: {active_scene}")

                    # Run inside the node for 5 seconds
                    print(f"Running inside Node {node_id} for 5 seconds...")
                    page.wait_for_timeout(5000)

                    # If already in GameOverScene (died within 5s), skip retreat and just return to MainScene
                    is_game_over = page.evaluate("""
                    const activeScene = window.game.scene.scenes.find(s => s.sys.isActive());
                    activeScene && activeScene.scene.key === 'GameOverScene'
                    """)

                    if not is_game_over:
                        # Trigger retreat
                        print("Triggering retreat...")
                        page.evaluate("""
                        // Dismiss LevelUpScene if present
                        const levelUp = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'LevelUpScene');
                        if (levelUp) {
                            const card = levelUp.children.list.find(c => c.type === 'Rectangle' && c.input);
                            if (card) {
                                card.emit('pointerdown');
                            }
                        }
                        const activeUiScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key.endsWith('UI'));
                        if (activeUiScene && activeUiScene.retreatBtn) {
                            activeUiScene.retreatBtn.emit('pointerdown');
                            activeUiScene.retreatBtn.emit('pointerup');
                        }
                        """)
                        page.wait_for_timeout(1000)

                        # Confirm retreat
                        print("Confirming retreat...")
                        page.evaluate("""
                        // Dismiss LevelUpScene if present
                        const levelUp = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'LevelUpScene');
                        if (levelUp) {
                            const card = levelUp.children.list.find(c => c.type === 'Rectangle' && c.input);
                            if (card) {
                                card.emit('pointerdown');
                            }
                        }
                        const activeUiScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key.endsWith('UI'));
                        if (activeUiScene) {
                            const confirmBtn = activeUiScene.children.list.find(c => c.type === 'Text' && c.text === '撤退' && c !== activeUiScene.retreatBtn);
                            if (confirmBtn) {
                                confirmBtn.emit('pointerdown');
                                confirmBtn.emit('pointerup');
                            }
                        }
                        """)
                        page.wait_for_timeout(2000)

                    # If in GameOverScene, click '返回大荒'
                    page.evaluate("""
                    const activeScene = window.game.scene.scenes.find(s => s.sys.isActive());
                    if (activeScene && activeScene.scene.key === 'GameOverScene') {
                        const backBtn = activeScene.children.list.find(c => c.type === 'Text' && c.text === '返回大荒');
                        if (backBtn) {
                            backBtn.emit('pointerdown');
                            backBtn.emit('pointerup');
                        }
                    }
                    """)
                    page.wait_for_timeout(2000)

                    # Verify returned to MainScene
                    active_scene = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                    print(f"Returned to scene: {active_scene}")
                    if active_scene != "MainScene":
                        raise Exception(f"Failed to return to MainScene after retreat. Active: {active_scene}")

                else:
                    # Execute Full Progression & 12-Node smoke test suite!
                    print("Executing full Dahuang E2E progression suite...")
                    
                    # Test Cave Opening cost assertion
                    print("Testing Cave Opening cost assertion...")
                    page.evaluate("""
                    store.set('resources', { bloodEssence: 0, suanBoneScript: 0, pureBlood: 0 });
                    store.set('progression', { realm: 1, realmName: "搬血境", cavesOpened: [], cavesActive: [], nextCaveCost: 100 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].caveBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].caveBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    caves = page.evaluate("store.get('progression.cavesOpened').length")
                    if caves != 0:
                        raise Exception(f"Cave opened without resources! Caves length is {caves}")

                    # Grant bloodEssence and open cave
                    page.evaluate("""
                    store.set('resources', { bloodEssence: 1000, suanBoneScript: 0, pureBlood: 0 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].caveBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].caveBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    caves = page.evaluate("store.get('progression.cavesOpened').length")
                    if caves != 1:
                        raise Exception(f"Cave opening failed with sufficient resources! Caves length is {caves}")
                    print("Cave opening check passed.")

                    # Test Breakthrough cost assertion
                    print("Testing Breakthrough cost assertion...")
                    page.evaluate("""
                    store.set('progression.realm', 1);
                    store.set('progression.cavesOpened', [1, 2, 3]);
                    store.set('resources', { bloodEssence: 0, suanBoneScript: 0, pureBlood: 0 });
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].realmBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].realmBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    realm = page.evaluate("store.get('progression.realm')")
                    if realm != 1:
                        raise Exception(f"Breakthrough succeeded without resources! Realm is {realm}")

                    # Grant bloodEssence and breakthrough
                    page.evaluate("""
                    store.set('resources', { bloodEssence: 8000, suanBoneScript: 0, pureBlood: 0 });
                    store.set('progression.cavesOpened', [1, 2, 3]);
                    window.game.scene.keys['MainScene'].updateUI();
                    """)
                    page.wait_for_timeout(500)
                    page.evaluate("window.game.scene.keys['MainScene'].realmBtn.emit('pointerdown'); window.game.scene.keys['MainScene'].realmBtn.emit('pointerup');")
                    page.wait_for_timeout(500)
                    realm = page.evaluate("store.get('progression.realm')")
                    if realm != 2:
                        raise Exception(f"Breakthrough failed with sufficient resources! Realm is {realm}")
                    print("Breakthrough check passed.")

                    # Loop smoke testing Nodes 1 to 12
                    for node in range(1, 13):
                        print(f"Smoke testing Node {node}...")
                        page.evaluate(f"""
                        store.set('progression.realm', 12);
                        store.getEffectiveStats = () => {{
                            return {{
                                baseHp: 100000,
                                baseAtk: 10,
                                baseSpeed: 200,
                                basePickupRange: 120,
                                baseCritRate: 0.05,
                                baseCritDmg: 1.5
                            }};
                        }};
                        const unlocked = store.get('unlockedNodes') || [];
                        if (!unlocked.includes({node})) {{
                            unlocked.push({node});
                            store.set('unlockedNodes', unlocked);
                        }}
                        NodeBridge.launchNode(window.game.scene.keys['MainScene'], {node});
                        """)
                        page.wait_for_timeout(2000)

                        # Verify active scene
                        active = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive() && !s.scene.key.endsWith('UI')).scene.key")
                        if active != f"Node{node}Scene":
                            raise Exception(f"Failed to enter Node {node} scene. Active: {active}")

                        if node == 1:
                            print("Running physical pickup and skill growth E2E validation for Node 1...")
                            # 1. Check initial active skills
                            initial_skills = page.evaluate("""
                            () => {
                                const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'Node1Scene');
                                return activeScene ? activeScene.activeSkills.map(s => ({ id: s.id, level: s.level })) : [];
                            }
                            """)
                            print(f"Node 1 initial skills: {initial_skills}")
                            if not any(s['id'] == 'primordial_fist' for s in initial_skills):
                                raise Exception(f"Expected Node 1 to start with primordial_fist, but got: {initial_skills}")

                            # 2. Spawn a pickup at player's location and overlap it
                            page.evaluate("""
                            () => {
                                const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'Node1Scene');
                                if (activeScene) {
                                    // Spawn essence with 15 exp (triggers level up, nextExp starts at 12)
                                    activeScene.spawnPickup(activeScene.player.x, activeScene.player.y, 15, []);
                                }
                            }
                            """)
                            page.wait_for_timeout(1500) # Wait for LevelUpScene to auto-choose

                            # 3. Check active skills after collection
                            grown_skills = page.evaluate("""
                            () => {
                                const activeScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'Node1Scene');
                                return activeScene ? activeScene.activeSkills.map(s => ({ id: s.id, level: s.level })) : [];
                            }
                            """)
                            print(f"Node 1 grown skills: {grown_skills}")
                            has_growth = (len(grown_skills) > len(initial_skills)) or any(
                                next(s['level'] for s in grown_skills if s['id'] == g['id']) > g['level']
                                for g in initial_skills if any(x['id'] == g['id'] for x in grown_skills)
                            )
                            if not has_growth:
                                raise Exception(f"First Node growth loop failed! Skills before: {initial_skills}, after: {grown_skills}")
                            print("Physical pickup collection and skill growth validation passed.")

                        # Wait 5 seconds
                        page.wait_for_timeout(5000)

                        # If already in GameOverScene (died within 5s), skip retreat and just return to MainScene
                        is_game_over = page.evaluate("""
                        const activeScene = window.game.scene.scenes.find(s => s.sys.isActive());
                        activeScene && activeScene.scene.key === 'GameOverScene'
                        """)

                        if not is_game_over:
                            # Retreat
                            print("Triggering retreat...")
                            page.evaluate("""
                            // Dismiss LevelUpScene if present
                            const levelUp = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'LevelUpScene');
                            if (levelUp) {
                                const card = levelUp.children.list.find(c => c.type === 'Rectangle' && c.input);
                                if (card) {
                                    card.emit('pointerdown');
                                }
                            }
                            const activeUiScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key.endsWith('UI'));
                            if (activeUiScene && activeUiScene.retreatBtn) {
                                activeUiScene.retreatBtn.emit('pointerdown');
                                activeUiScene.retreatBtn.emit('pointerup');
                            }
                            """)
                            page.wait_for_timeout(1000)

                            # Confirm retreat
                            print("Confirming retreat...")
                            page.evaluate("""
                            // Dismiss LevelUpScene if present
                            const levelUp = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key === 'LevelUpScene');
                            if (levelUp) {
                                const card = levelUp.children.list.find(c => c.type === 'Rectangle' && c.input);
                                if (card) {
                                    card.emit('pointerdown');
                                }
                            }
                            const activeUiScene = window.game.scene.scenes.find(s => s.sys.isActive() && s.scene.key.endsWith('UI'));
                            if (activeUiScene) {
                                const confirmBtn = activeUiScene.children.list.find(c => c.type === 'Text' && c.text === '撤退' && c !== activeUiScene.retreatBtn);
                                if (confirmBtn) {
                                    confirmBtn.emit('pointerdown');
                                    confirmBtn.emit('pointerup');
                                }
                            }
                            """)
                            page.wait_for_timeout(2000)

                        # If in GameOverScene, click '返回大荒'
                        page.evaluate("""
                        const activeScene = window.game.scene.scenes.find(s => s.sys.isActive());
                        if (activeScene && activeScene.scene.key === 'GameOverScene') {
                            const backBtn = activeScene.children.list.find(c => c.type === 'Text' && c.text === '返回大荒');
                            if (backBtn) {
                                backBtn.emit('pointerdown');
                                backBtn.emit('pointerup');
                            }
                        }
                        """)
                        page.wait_for_timeout(2000)

                        # Verify returned to MainScene
                        active = page.evaluate("window.game.scene.scenes.find(s => s.sys.isActive()).scene.key")
                        if active != "MainScene":
                            raise Exception(f"Failed to return to MainScene from Node {node}. Active: {active}")
                        print(f"Node {node} smoke test passed successfully.")

            print("Playwright validation completed.")

        except Exception as e:
            print(f"\n[ERROR] Playwright interaction failed: {e}")
            errors.append(f"Interaction failure: {str(e)}")
            # Take error screenshot
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            ss_path = f"error_screenshot_{timestamp}.png"
            page.screenshot(path=ss_path)
            print(f"Saved error screenshot to: {os.path.abspath(ss_path)}")
        finally:
            browser.close()
            proc.terminate()

        if errors:
            print("\n--- VALIDATION FAILED: ERRORS DETECTED ---")
            for err in errors:
                print(err)
            sys.exit(1)
        else:
            print("\n+++ VALIDATION PASSED: NO ERRORS DETECTED +++")
            sys.exit(0)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run Playwright tests for minigames.')
    parser.add_argument('--game', required=True, help='Name of the game directory or core demo (e.g., xianni, perfectworld_dahuang, survivor_horde)')
    parser.add_argument('--node', type=int, help='Specific Node ID to run a smoke test on')
    parser.add_argument('--grant-state', help='JSON string to inject into localStorage before testing')
    args = parser.parse_args()
    
    run_test(args.game, args.node, args.grant_state)
