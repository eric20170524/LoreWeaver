import argparse
import urllib.request
import subprocess
import time
import sys
import json
import os
import socket
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
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
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
            page.on("console", lambda msg: errors.append(f"Console Error: {msg.text}") if msg.type == "error" else None)

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
        stdout, stderr = stop_process(proc)

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

def run_test(game_name, node_id=None, grant_state_str=None):
    if game_name == 'survivor_horde':
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
