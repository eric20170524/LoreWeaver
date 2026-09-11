import { startLoreWeaverRuntime } from '../../src/runtime/LoreWeaverRuntimeKernel';
import { INITIAL_PLAYER_STATE } from '../../src/runtime/playerState';
import { synth } from '../../src/utils/AudioSynth';
import card from '../../minigame_master/gameplay/cards/dodge_counter_boss.json';

declare const LAB_REVISION: string;
const $ = (id: string) => document.getElementById(id)!;
const start = $('start') as HTMLButtonElement;
const pause = $('pause') as HTMLButtonElement;
const quit = $('quit') as HTMLButtonElement;
const duration = $('duration') as HTMLInputElement;
const hp = $('hp') as HTMLInputElement;
duration.required = hp.required = true;
let runtime: ReturnType<typeof startLoreWeaverRuntime> | null = null;
let adapter: any = null;
let generation = 0;
let starting = false;
let launchPending = false;
let deadline = 0;
let lastResult: any = null;
let saves: any[] = [];
let logs: string[] = [];
let ended = false;
let runConfig: any = null;
const snapshot = () => structuredClone({
  generation, starting, specHash: runtime?.resolvedSpec.specHash || null,
  cardId: card.id, revision: LAB_REVISION, config: runConfig,
  state: adapter?.getTestState?.() || null, result: lastResult,
  bossPosition: adapter?.boss ? { x: adapter.boss.x, y: adapter.boss.y } : null,
  saves: structuredClone(saves), logs: logs.slice(-15),
  sceneKeys: runtime?.game.scene.getScenes(true).map(scene => scene.sys.settings.key) || []
});
// Read-only snapshots for diagnostics. No forced-win, HP-edit or phase-edit hooks.
Object.defineProperty(window, '__CARD_LAB__', { value: Object.freeze({ snapshot }), configurable: true });
$('revision').textContent = LAB_REVISION.slice(0, 12);
$('definition').textContent = JSON.stringify(card, null, 2);
if (!synth.getMuteState()) synth.toggleMute();

function stop() {
  launchPending = false;
  adapter = null;
  runtime?.destroy();
  runtime = null;
  synth.stopBgm();
  synth.stopBossTheme();
  $('game').replaceChildren();
}
function focusGame() {
  const canvas = runtime?.game.canvas;
  if (!canvas) return;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '闪避反击游戏画面');
  canvas.focus({ preventScroll: true });
}
function launch() {
  if (starting) return;
  if (!duration.checkValidity() || !hp.checkValidity()) {
    (duration.checkValidity() ? hp : duration).reportValidity();
    return;
  }
  stop(); generation += 1; starting = true; ended = false;
  lastResult = null; saves = []; logs = [];
  start.disabled = true; pause.disabled = true; quit.disabled = true;
  $('result').textContent = '本次尚未结算';
  $('status').textContent = '加载中';
  runConfig = Object.fromEntries(Object.entries(card.knobs).map(([key, knob]) => [key, knob.default]));
  runConfig.durationSec = Number(duration.value);
  runConfig.playerHp = Number(hp.value);
  const node = {
    id: 1, title: '闪避反击试炼', intro: '按住拖动离开危险区。金色反击窗口出现时，点击红色 Boss 或按空格。每个窗口只接受一次反击。',
    taunts: ['看清预警，再抓住反击窗口。'], mechanics: card.id, rewards: '试验场完成记录',
    goalValue: Number(runConfig.breakGaugeMax), resourceMultiplier: 1, difficulty: 1,
    durationLimit: Number(runConfig.durationSec),
    gameplay: { adapter: 'phaser', cardId: card.id, modifiers: [], knobs: { ...runConfig }, patchLevel: 'L1' as const }
  };
  try {
    runtime = startLoreWeaverRuntime({
      title: 'Gameplay Card Lab', themeColor: '#67e8d6',
      economy: { currencyName: '训练点', resources: ['练习记录'], realms: ['练习者'] },
      nodes: [node], uiConfig: { plugin: 'default' }
    }, {
      container: $('game'), hostKind: 'test', initialPlayerState: structuredClone(INITIAL_PLAYER_STATE),
      saveState: state => { saves.push(structuredClone(state)); if (saves.length > 40) saves.shift(); },
      logger: message => { logs.push(message); if (logs.length > 80) logs.shift(); }
    });
    launchPending = true; deadline = Date.now() + 15000;
  } catch (error) {
    stop(); starting = false; start.disabled = false;
    $('status').textContent = '启动失败'; $('result').textContent = String(error);
  }
}
start.addEventListener('click', launch);
pause.addEventListener('click', () => {
  if (!adapter || ended) return;
  if (adapter.status === 'paused') adapter.resume();
  else if (adapter.status === 'running') adapter.pause();
  // Space belongs to gameplay, not the last clicked DOM button.
  focusGame();
});
quit.addEventListener('click', () => {
  if (!adapter || ended) return;
  // Capture the real result; retreat may synchronously dispose its scene.
  const result = adapter.retreat();
  if (result) lastResult = structuredClone(result);
});
const refresh = window.setInterval(() => {
  if (!runtime) return;
  const game = runtime.game;
  if (launchPending && game.scene.isActive('MainScene')) {
    launchPending = false;
    // The same transition used by the workbench node button stops the old menu.
    (game.scene.keys.MainScene as any).scene.start('LevelActiveScene', { node: runtime.resolvedSpec.gameSpec.nodes[0] });
  }
  const scene = game.scene.keys.LevelActiveScene as any;
  if (scene?.adapter) adapter = scene.adapter;
  const state = adapter?.getTestState?.();
  if (starting && state?.status === 'running') {
    starting = false; start.disabled = false;
    focusGame();
  } else if (starting && Date.now() > deadline) {
    stop(); starting = false; start.disabled = false;
    $('status').textContent = '启动超时'; $('result').textContent = logs.join('\n'); return;
  }
  if (!lastResult && state?.lastResult) lastResult = structuredClone(state.lastResult);
  if (lastResult && !ended) {
    ended = true;
    $('result').textContent = JSON.stringify(lastResult, null, 2);
  }
  pause.disabled = !state || !['running', 'paused'].includes(state.status) || ended;
  quit.disabled = pause.disabled;
  pause.textContent = state?.status === 'paused' ? '继续' : '暂停';
  const phases: Record<string, string> = { idle: '等待出招', warning: '危险预警', active: '攻击判定', counter: '反击窗口' };
  $('status').textContent = ended ? (lastResult.success ? '挑战成功' : lastResult.reason === 'retreated' ? '已退出' : '挑战失败')
    : state?.status === 'paused' ? '已暂停' : state?.status === 'running' ? phases[state.phase] || '运行中' : '等待开场';
  if (state) {
    $('timer').textContent = `${Math.ceil(state.timer ?? 0)}s`;
    $('health').textContent = String(state.hp ?? '—');
    $('gauge').textContent = `${state.gauge ?? 0}/${state.goalValue ?? 100}`;
    $('counters').textContent = String(state.counters ?? 0);
  }
}, 50);
window.addEventListener('pagehide', () => { clearInterval(refresh); stop(); });
