import { startLoreWeaverRuntime } from '../../src/runtime/LoreWeaverRuntimeKernel';
import { INITIAL_PLAYER_STATE } from '../../src/runtime/playerState';
import { synth } from '../../src/utils/AudioSynth';
import dodgeCard from '../../minigame_master/gameplay/cards/dodge_counter_boss.json';
import rhythmCard from '../../minigame_master/gameplay/cards/rhythm_timing.json';
import collectCard from '../../minigame_master/gameplay/cards/drag_collect_grid.json';
import sequenceCard from '../../minigame_master/gameplay/cards/sequence_synthesis.json';

const cards = { dodge_counter_boss: dodgeCard, rhythm_timing: rhythmCard, drag_collect_grid: collectCard, sequence_synthesis: sequenceCard };
let card: any = cards[new URLSearchParams(location.search).get('card') as keyof typeof cards] || dodgeCard;

declare const LAB_REVISION: string;
const $ = (id: string) => document.getElementById(id)!;
const start = $('start') as HTMLButtonElement;
const pause = $('pause') as HTMLButtonElement;
const quit = $('quit') as HTMLButtonElement;
const duration = $('duration') as HTMLInputElement;
const hp = $('hp') as HTMLInputElement;
const selector = $('card') as HTMLSelectElement;
const target = $('target') as HTMLInputElement;
const combo = $('combo') as HTMLInputElement;
const hazard = $('hazard') as HTMLInputElement;
const damage = $('damage') as HTMLInputElement;
const recipe = $('recipe') as HTMLInputElement;
const pool = $('pool') as HTMLInputElement;
const penalty = $('penalty') as HTMLInputElement;
const seed = $('seed') as HTMLInputElement;
const explode = $('explode') as HTMLSelectElement;
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
  canvas.setAttribute('aria-label', `${card.title} 游戏画面`);
  canvas.focus({ preventScroll: true });
}
function launch() {
  if (starting) return;
  const fields = [duration, hp, ...(card.id === 'rhythm_timing' ? [target, combo] : card.id === 'drag_collect_grid' ? [target, hazard, damage] : card.id === 'sequence_synthesis' ? [recipe, pool, penalty, seed] : [])];
  const invalid = fields.find(field => !field.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return;
  }
  stop(); generation += 1; starting = true; ended = false;
  lastResult = null; saves = []; logs = [];
  start.disabled = true; pause.disabled = true; quit.disabled = true;
  $('result').textContent = '本次尚未结算';
  $('status').textContent = '加载中';
  runConfig = Object.fromEntries(Object.entries(card.knobs).map(([key, knob]) => [key, (knob as { default: unknown }).default]));
  runConfig.durationSec = Number(duration.value);
  runConfig.playerHp = Number(hp.value);
  const rhythm = card.id === 'rhythm_timing';
  const collect = card.id === 'drag_collect_grid';
  const sequence = card.id === 'sequence_synthesis';
  if (collect) {
    runConfig.timeLimitSec = Number(duration.value);
    runConfig.needAmount = runConfig.goalValue = Number(target.value);
    runConfig.hazardRate = Number(hazard.value);
    runConfig.damageOnHit = Number(damage.value);
  }
  if (rhythm) {
    runConfig.targetProgress = Number(target.value);
    runConfig.requiredBestCombo = Number(combo.value);
  }
  if (sequence) {
    runConfig.recipeLength = Number(recipe.value);
    runConfig.materialPoolSize = Number(pool.value);
    runConfig.wrongInputProgressPenalty = Number(penalty.value);
    runConfig.runSeed = Number(seed.value);
    runConfig.explodeFails = explode.value === 'true';
    // Content only: same adapter draws and handles all material controls.
    runConfig.themeContentPack = { defaultLocale: 'zh-CN', copyKeys: {
      title_inline: '顺序合成', hint_feed: '按配方顺序点击材料，或按对应数字键',
      recipe_prefix: '配方：', step_fmt: '第 {i}/{n} 步 · 需要：{m}',
      ok_feed: '投入正确：{m}', bad_feed_steps: '投入错误，回退 {n} 步',
      explode_reset: '过热！从配方第一步重新开始',
      progress_fmt: '进度 {p}% · 错误 {m} 次 · 连错 {c}/{max}',
      material_wood:'木', material_fire:'火', material_water:'水', material_metal:'金',
      material_earth:'土', material_wind:'风', material_thunder:'雷', material_ice:'冰'
    } };
  }
  const node = {
    id: 1, title: sequence ? '顺序合成试炼' : collect ? '拖拽收集试炼' : rhythm ? '节奏共鸣试炼' : '闪避反击试炼', intro: sequence ? '按配方顺序投入材料。错误回退已完成步骤，连续错误重置或失败，超时失败。' : collect ? '按住横向拖动，接绿珠、避红珠。收集达标获胜，超时或生命归零失败。' : rhythm ? '圆环重合时点击中心或按空格。进度与最佳连击均达标才成功。' : '按住拖动离开危险区。金色反击窗口出现时，点击红色 Boss 或按空格。每个窗口只接受一次反击。',
    taunts: [sequence ? '看清配方，从左到右依次投入。' : collect ? '观察落点，及时走位。' : rhythm ? '听从节拍，看准圆环。' : '看清预警，再抓住反击窗口。'], mechanics: card.id, rewards: '试验场完成记录',
    goalValue: Number(sequence ? 100 : collect ? runConfig.needAmount : rhythm ? runConfig.targetProgress : runConfig.breakGaugeMax), resourceMultiplier: 1, difficulty: 1,
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
    $('gauge').textContent = `${state.gauge ?? state.score ?? 0}/${state.goalValue ?? 100}`;
    $('counters').textContent = card.id === 'rhythm_timing' ? `${state.combo ?? 0} / ${state.bestCombo ?? 0}` : card.id === 'drag_collect_grid' ? String(state.hazardsHit ?? 0) : card.id === 'sequence_synthesis' ? `${state.mistakes ?? 0} / ${state.resets ?? 0}` : String(state.counters ?? 0);
  }
}, 50);
window.addEventListener('pagehide', () => { clearInterval(refresh); stop(); });

function selectCard() {
  stop(); starting = false; ended = false; lastResult = null; runConfig = null; saves = []; logs = [];
  selector.value = card.id;
  const rhythm = card.id === 'rhythm_timing';
  const collect = card.id === 'drag_collect_grid';
  const sequence = card.id === 'sequence_synthesis';
  document.title = `玩法卡试验场 · ${sequence ? '顺序合成' : collect ? '拖拽收集' : rhythm ? '节奏点击' : '闪避反击'}`;
  $('heading').textContent = sequence ? '04 · 顺序合成' : collect ? '03 · 拖拽收集' : rhythm ? '02 · 节奏点击' : '01 · 闪避反击 Boss';
  $('card-id').textContent = card.id;
  $('subtitle').textContent = sequence ? '读配方，按序合成' : collect ? '接住绿珠，避开红珠' : rhythm ? '看准节拍，稳定连击' : '读招，然后反击';
  $('instructions').innerHTML = sequence
    ? '<p>① 按可见配方从左到右点击材料；数字1～8对应材料按钮。</p><p>② 错误按惩罚比例回退完整步骤（向上取整）；默认30%在4步配方中回退2步。连错2次重置，可切换为直接失败。</p><p>③ 完成整份配方获胜；超时失败。种子0也是固定配方。触摸点击与鼠标规则一致。</p>'
    : collect
    ? '<p>① 按住鼠标或手指，横向拖动底部角色；悬停不会移动。</p><p>② 接绿色珠子加1，碰红色珠子扣生命。默认40秒内接16颗绿珠。</p><p>③ 达标获胜；超时或生命耗尽失败。默认不插入Boss阶段。</p>'
    : rhythm
    ? '<p>① 外圈收拢到白环时，点击中心或按空格。</p><p>② Perfect ±80ms 得10分；Good ±160ms 得5分。过早或漏拍扣生命并断连击，每拍只结算一次。</p><p>③ 进度和最佳连击同时达标才获胜。默认10次Perfect可完成；不是随意点击加分。</p>'
    : '<p>① 按住拖动青色角色，离开黄 / 红色危险区。</p><p>② 金圈亮起时，点击红色 Boss 或按空格。每个窗口仅一次。</p><p>③ 破势达到100或Boss血量归零获胜；生命耗尽或超时失败。</p>';
  $('rhythm-config').hidden = !(rhythm || collect);
  $('combo-field').hidden = !rhythm;
  $('collect-config').hidden = !collect;
  $('sequence-config').hidden = !sequence;
  $('progress-label').textContent = sequence ? '配方进度' : collect ? '已收集' : rhythm ? '进度' : '破势';
  $('count-label').textContent = sequence ? '错误 / 重置' : collect ? '受击次数' : rhythm ? '当前 / 最佳连击' : '反击次数';
  for (const [field, key] of [[duration, 'durationSec'], [hp, 'playerHp']] as const) {
    const knob = card.knobs[key]; field.value = String(knob.default);
    field.min = String(knob.min); field.max = String(knob.max);
  }
  for (const [field, key] of [[recipe, 'recipeLength'], [pool, 'materialPoolSize'], [penalty, 'wrongInputProgressPenalty'], [seed, 'runSeed']] as const) {
    const knob = sequenceCard.knobs[key]; field.value = String(knob.default);
    field.min = String(knob.min); field.max = String(knob.max);
  }
  explode.value = String(sequenceCard.knobs.explodeFails.default);
  target.value = String(collect ? collectCard.knobs.needAmount.default : rhythmCard.knobs.targetProgress.default);
  target.max = collect ? '200' : '1000';
  hazard.value = String(collectCard.knobs.hazardRate.default);
  damage.value = String(collectCard.knobs.damageOnHit.default);
  combo.value = String(rhythmCard.knobs.requiredBestCombo.default);
  $('definition').textContent = JSON.stringify(card, null, 2);
  $('status').textContent = '尚未开始'; $('result').textContent = '本次尚未结算';
  for (const id of ['timer', 'health', 'gauge', 'counters']) $(id).textContent = '—';
  start.disabled = false; pause.disabled = quit.disabled = true;
}
selector.addEventListener('change', () => {
  card = cards[selector.value as keyof typeof cards] || dodgeCard;
  selectCard();
});
selectCard();
