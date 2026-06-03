import argparse
import urllib.request
import subprocess
import time
import sys
import json
import os
from datetime import datetime
from playwright.sync_api import sync_playwright

def run_test(game_name, node_id=None, grant_state_str=None):
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
    parser.add_argument('--game', required=True, help='Name of the game directory (e.g., xianni, perfectworld_dahuang)')
    parser.add_argument('--node', type=int, help='Specific Node ID to run a smoke test on')
    parser.add_argument('--grant-state', help='JSON string to inject into localStorage before testing')
    args = parser.parse_args()
    
    run_test(args.game, args.node, args.grant_state)