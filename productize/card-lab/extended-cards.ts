import qixCard from '../../minigame_master/gameplay/cards/qix_area_capture.json';
import rhythmPickupCard from '../../minigame_master/gameplay/cards/rhythm_then_pickup.json';
import comboCard from '../../minigame_master/gameplay/cards/sequence_puzzle_combo.json';
import hazardWavesCard from '../../minigame_master/gameplay/cards/hazard_collect_waves.json';
import platformCard from '../../minigame_master/gameplay/cards/platform_escape.json';
import mazeCard from '../../minigame_master/gameplay/cards/maze_exploration_choice.json';
import shooterCard from '../../minigame_master/gameplay/cards/shooter_duel.json';
import dialogueCard from '../../minigame_master/gameplay/cards/branching_dialogue_check.json';
import runeCard from '../../minigame_master/gameplay/cards/rune_connect_sequence.json';
import pressureCard from '../../minigame_master/gameplay/cards/pressure_survival.json';
import dragCoreCard from '../../minigame_master/gameplay/cards/drag_to_core.json';
import observeCard from '../../minigame_master/gameplay/cards/observe_capture.json';
import reactionCard from '../../minigame_master/gameplay/cards/reaction_pick.json';
import energyCard from '../../minigame_master/gameplay/cards/energy_balance.json';

// Only add cards here after supplying their real-input acceptance suite.
// This is host UI metadata; all gameplay remains in the shared core adapters.
export type ExtraLabCard = {
  card: any;
  heading: string;
  title: string;
  intro: string;
  fields: { key: string; label: string }[];
  validate?: (knobs: Record<string, any>) => string | null;
  goal: (knobs: any) => number;
  progress: (state: any) => string;
  health: (state: any) => number;
  count: (state: any) => number;
  healthLabel: string;
  progressLabel: string;
  countLabel: string;
};

export const extraLabCards: Record<string, ExtraLabCard> = {
  qix_area_capture: {
    card: qixCard, heading: '21 · 区域占领', title: '区域占领试炼',
    intro: 'WASD/方向键移动，或点击目的格自动逐格靠近。灰色边框和蓝色区域安全；进入空白画黄线，回到安全区后占领没有敌人的区域。敌人碰到未完成的线会扣 20 生命并回到左侧起点。默认 90 秒内占领内部 70% 获胜。',
    fields: [ { key: 'captureTarget', label: '目标占领比例' }, { key: 'gridCols', label: '网格列数' }, { key: 'gridRows', label: '网格行数' }, { key: 'enemyCount', label: '敌人数（允许零）' }, { key: 'timeLimitSec', label: '时限（秒）' }, { key: 'playerSpeed', label: '移动速度（基准 140）' }, { key: 'enemySpeed', label: '敌人速度' }, { key: 'pathMinCells', label: '闭合路径最少格数' } ],
    goal: () => 0, progress: state => `${(100 * (state.captureRatio ?? 0)).toFixed(1)}%`,
    health: state => state.hp ?? 0, count: state => state.pathHits ?? 0,
    healthLabel: '生命', progressLabel: '占领', countLabel: '断线'
  },
  rhythm_then_pickup: {
    card: rhythmPickupCard, heading: '20 · 节奏后拾取', title: '节奏拾取试炼',
    intro: '圆环最大、最亮时点击或按空格，每拍只判定一次。默认命中 12 拍后，20 秒内拾取 5 个紫色目标；点击目标或按空格拾取最早出现的目标。节奏失误可继续，拾取超时失败。',
    fields: [ { key: 'phase1Target', label: '节奏命中目标' }, { key: 'bottlesNeeded', label: '拾取目标数量' }, { key: 'phase2LimitSec', label: '拾取时限（秒）' }, { key: 'beatIntervalMs', label: '节拍间隔（毫秒）' }, { key: 'perfectWindowMs', label: '完美窗口（毫秒）' }, { key: 'goodWindowMs', label: '有效窗口（毫秒）' }, { key: 'bottleAppearMinSec', label: '最短生成间隔（秒）' }, { key: 'bottleAppearMaxSec', label: '最长生成间隔（秒）' }, { key: 'bottleLifeMinSec', label: '最短停留（秒）' }, { key: 'bottleLifeMaxSec', label: '最长停留（秒）' } ],
    validate: k => k.perfectWindowMs > k.goodWindowMs || k.goodWindowMs >= k.beatIntervalMs / 2 ? '判定窗口需满足：完美 ≤ 有效 < 半个节拍。' : k.bottleAppearMaxSec < k.bottleAppearMinSec || k.bottleLifeMaxSec < k.bottleLifeMinSec ? '最长间隔或停留时间不能小于最短值。' : k.phase2LimitSec < k.bottlesNeeded * k.bottleAppearMaxSec + 0.2 ? '拾取时限不足以生成所需目标，请增加时间或缩短生成间隔。' : null,
    goal: () => 0, progress: state => state.phase === 1 ? `${state.hits}/${state.phase1Target}` : `${state.bottles}/${state.bottlesNeeded}`,
    health: state => state.phase ?? 1, count: state => state.targets?.length ?? 0,
    healthLabel: '阶段', progressLabel: '目标', countLabel: '可拾取'
  },
  sequence_puzzle_combo: {
    card: comboCard, heading: '19 · 顺序拼图组合', title: '顺序拼图试炼',
    intro: '先观察黄色亮灯，演示结束后按顺序点击或按数字键。答错会重新演示。第二阶段把编号碎片拖到同号槽位；也可按数字键先选碎片，再选槽。拼错可重试，没有死亡或限时失败，可随时撤退。',
    fields: [ { key: 'sequenceLength', label: '亮灯序列长度' }, { key: 'pieceCount', label: '拼图块数' } ],
    goal: () => 100, progress: state => `${Math.floor(state.progress ?? 0)}%`,
    health: state => state.phase ?? 1, count: state => state.mistakes ?? 0,
    healthLabel: '阶段', progressLabel: '进度', countLabel: '失误'
  },
  hazard_collect_waves: {
    card: hazardWavesCard, heading: '18 · 闪避采集波次', title: '闪避采集试炼',
    intro: '拖动或 WASD/方向键移动，避开黄色预警区。落雷后出现蓝色能量珠，点击或靠近即可采集并回复 3 生命。每波时间结束时检查数量，默认三波分别需要 4、5、6 颗；数量不足或生命耗尽失败。采集够后仍需等到本波结束。',
    fields: [ { key: 'maxWave', label: '波次数' }, { key: 'waveTimeSec', label: '每波时间（秒）' }, { key: 'collectTargetPerWave', label: '第一波采集目标' }, { key: 'warningSec', label: '落雷预警（秒）' }, { key: 'strikeDamage', label: '落雷伤害' }, { key: 'hazardIntervalSec', label: '落雷间隔（秒）' } ],
    validate: knobs => knobs.waveTimeSec < (knobs.collectTargetPerWave + knobs.maxWave - 1) * knobs.hazardIntervalSec + knobs.warningSec + 0.2 ? '每波时间不足以生成最后一波需要的能量珠，请增加时间或减少目标/间隔。' : null,
    goal: () => 0, progress: state => `${state.collected ?? 0}/${state.need ?? 4}`,
    health: state => state.hp ?? 0, count: state => state.wave ?? 1,
    healthLabel: '生命', progressLabel: '本波采集', countLabel: '波次'
  },
  platform_escape: {
    card: platformCard, heading: '17 · 平台逃生', title: '平台逃生试炼',
    intro: '自动向终点推进。A/D 或左右键移动，W/上键/空格或点击画布跳跃。躲开红色刀刃和灰色落石；进度到 100 获胜，生命耗尽失败。默认路程约需 22.5 秒，触屏点击即可起跳。',
    fields: [ { key: 'levelLen', label: '路程长度' }, { key: 'progressSpeed', label: '推进速度' }, { key: 'hazardIntervalMs', label: '障碍间隔（毫秒）' }, { key: 'gravity', label: '重力' }, { key: 'jumpV0', label: '跳跃初速' }, { key: 'moveSpeed', label: '移动速度' } ],
    goal: () => 100, progress: state => `${Math.floor(state.progress ?? 0)}%`,
    health: state => state.hp ?? 0, count: state => state.jumps ?? 0,
    healthLabel: '生命', progressLabel: '路程', countLabel: '跳跃'
  },
  maze_exploration_choice: {
    card: mazeCard, heading: '16 · 迷宫抉择', title: '迷宫抉择试炼',
    intro: '用 WASD/方向键逐格移动，或点击角色周围指定方向。黄色格会询问是否花费能量救援，绿色格是出口。救援可获额外奖励；跳过或能量不足仍能通关。没有限时，可随时撤退。',
    fields: [ { key: 'mazeW', label: '迷宫宽（偶数向上取奇数）' }, { key: 'mazeH', label: '迷宫高（偶数向上取奇数）' }, { key: 'startingQi', label: '初始能量' }, { key: 'rescueCost', label: '救援能量消耗' }, { key: 'runSeed', label: '地图种子' } ],
    goal: () => 0, progress: state => `(${state.gx},${state.gy})`,
    health: state => state.qi ?? 0, count: state => state.rescued ? 1 : 0,
    healthLabel: '能量', progressLabel: '所在格', countLabel: '救援'
  },
  shooter_duel: {
    card: shooterCard, heading: '15 · 对决射击', title: '对决射击试炼',
    intro: 'A/D 或方向键横移，按住 J/空格射击；鼠标或触屏按住拖动可同时移动和连续射击。预判红色 Boss 的移动，避开红色弹丸；击败 Boss 获胜，生命耗尽或超时失败。',
    fields: [ { key: 'playerHp', label: '玩家生命' }, { key: 'bossHp', label: 'Boss 生命' }, { key: 'timeLimitSec', label: '时间上限（秒）' } ],
    goal: () => 0, progress: state => String(state.bossHp ?? 0),
    health: state => state.hp ?? 0, count: state => (state.bullets?.length ?? 0) + (state.enemyBullets?.length ?? 0),
    healthLabel: '生命', progressLabel: 'Boss 生命', countLabel: '场上弹丸'
  },
  branching_dialogue_check: {
    card: dialogueCard, heading: '14 · 分支对话检定', title: '分支对话试炼',
    intro: '阅读对话并点击选项。关键物品与阶段决定路线，灰色选项可进入提示的替代分支。好、普通结局均通过；坏结局失败。可配置初始好感、检定阶段和关键物品。',
    fields: [ { key: 'startFavor', label: '初始好感' }, { key: 'realmStage', label: '检定阶段（0 跟随玩家）' }, { key: 'hasRelic', label: '持有关键物品' } ],
    goal: () => 0, progress: state => state.ending || state.nodeId || 'start',
    health: state => state.favor ?? 0, count: state => state.choicesMade ?? 0,
    healthLabel: '好感', progressLabel: '对话节点', countLabel: '选择次数'
  },
  rune_connect_sequence: {
    card: runeCard, heading: '13 · 顺序连线', title: '顺序连线试炼',
    intro: '按提示从蓝色起点拖向黄色终点后松手。默认完成七条连线获胜；起点或终点选错会消耗容错，六次失误失败。在空白处松手会取消连线。',
    fields: [ { key: 'runeCount', label: '符文数量' }, { key: 'snapRadius', label: '吸附半径' }, { key: 'maxMistakes', label: '失误上限' } ],
    goal: knobs => (knobs.runeCount - 1) * 10,
    progress: state => `${state.stepIndex ?? 0}/${state.linksNeeded ?? 7}`,
    health: state => Math.max(0, state.maxMistakes - state.mistakes), count: state => state.mistakes ?? 0,
    healthLabel: '容错', progressLabel: '完成连线', countLabel: '失误'
  },
  pressure_survival: {
    card: pressureCard, heading: '12 · 极限抗压', title: '极限抗压试炼',
    intro: '坚持到倒计时结束。点击画面减压，紫色目标提供额外减压；右下角“强压”立即减压，并暂时降低压力增长、增强点击效果。压力满格即失败。',
    fields: [
      { key: 'durationSec', label: '生存时间（秒）' }, { key: 'pressureGrowthPerSec', label: '每秒压力增长' },
      { key: 'clickRelief', label: '每次点击减压' }, { key: 'skillCooldownSec', label: '技能冷却（秒）' }
    ],
    goal: knobs => knobs.durationSec, progress: state => `${Number(state.elapsed ?? 0).toFixed(1)}/${state.durationSec ?? 30}s`,
    health: state => Math.ceil(state.pressure ?? 0), count: state => state.targetsHit ?? 0,
    healthLabel: '压力', progressLabel: '已坚持', countLabel: '目标命中'
  },
  drag_to_core: {
    card: dragCoreCard, heading: '11 · 碎片归核', title: '碎片归核试炼',
    intro: '把金色碎片拖入蓝色核心，松手前避开红色干扰区。干扰会扣进度，碎片可重试。进度达到 100%，或投入全部碎片后获胜；没有限时或生命耗尽失败，可随时撤退。',
    fields: [
      { key: 'fragCount', label: '碎片数量' }, { key: 'hazardCount', label: '干扰区数量' },
      { key: 'hazardPenalty', label: '干扰扣除进度' }, { key: 'hazardSpeed', label: '干扰移动速度' }
    ],
    goal: () => 100, progress: state => `${Math.floor(state.progress ?? 0)}%`,
    health: state => state.frags?.length ?? 0, count: state => state.fails ?? 0,
    healthLabel: '剩余碎片', progressLabel: '汇聚', countLabel: '干扰次数'
  },
  observe_capture: {
    card: observeCard, heading: '10 · 观形捕捉', title: '观形捕捉试炼',
    intro: '观察粉色目标，在蓝色锁定环出现时点击它。默认每次捕捉增加 22 进度，达到 100 获胜；移动时误点扣 12 进度。错过窗口可继续等待，没有生命耗尽或限时失败；可随时撤退。',
    fields: [
      { key: 'targetProgress', label: '目标进度' },
      { key: 'captureGain', label: '每次捕捉增加进度' },
      { key: 'missPenalty', label: '移动时误点扣除进度' },
      { key: 'pauseWindowSec', label: '锁定窗口（秒）' }
    ],
    goal: knobs => knobs.targetProgress,
    progress: state => `${state.progress ?? 0}/${state.targetProgress ?? 100}`,
    health: state => state.captures ?? 0, count: state => state.misses ?? 0,
    healthLabel: '捕捉', progressLabel: '进度', countLabel: '误点'
  },
  energy_balance: {
    card: energyCard,
    heading: '09 · 能量平衡', title: '能量平衡试炼',
    intro: '把元素球拖入蓝色圆心，让指针回到绿色安全区。木、水向左；火、金、土向右。达到配置的累计稳定时间获胜，持续越过黄色警戒区会消耗容错，容错耗尽失败。注意持续漂移的方向，及时调节。',
    fields: [
      { key: 'targetStableSec', label: '累计稳定时间（秒）' },
      { key: 'safeZoneWidth', label: '安全区宽度比例' },
      { key: 'failViolationLimit', label: '失衡容错次数' },
      { key: 'failOverWarn', label: '每次容错允许的持续越界（秒）' },
      { key: 'orbSpawnMinSec', label: '元素最短生成间隔（秒）' },
      { key: 'orbSpawnMaxSec', label: '元素最长生成间隔（秒）' }
    ],
    validate: knobs => knobs.orbSpawnMaxSec < knobs.orbSpawnMinSec ? '最长生成间隔不能小于最短间隔。' : null,
    goal: knobs => knobs.targetStableSec,
    progress: state => `${Number(state.stableSec || 0).toFixed(1)}/${state.targetStableSec ?? 20}s`,
    health: state => state.failViolationLimit - state.violations,
    count: state => state.orbs?.length || 0,
    healthLabel: '容错', progressLabel: '稳定时间', countLabel: '可用元素'
  },
  reaction_pick: {
    card: reactionCard,
    heading: '08 · 辨宝反应',
    title: '辨宝反应试炼',
    intro: '看清“找出”的目标名称，在选项中点击对应道具。默认答对六轮获胜；选错或超时扣一次机会，三次机会耗尽失败。每轮只接受一次选择。',
    fields: [
      { key: 'targetRounds', label: '需要答对的轮数' },
      { key: 'lives', label: '初始机会' },
      { key: 'showLifeMinSec', label: '每轮最短时间（秒）' },
      { key: 'showLifeMaxSec', label: '每轮最长时间（秒）' }
    ],
    validate: knobs => knobs.showLifeMaxSec < knobs.showLifeMinSec ? '最长时间不能小于最短时间。' : null,
    goal: knobs => knobs.targetRounds * 10,
    progress: state => `${state.correct ?? 0}/${state.targetRounds ?? 6}`,
    health: state => state.lives,
    count: state => state.round,
    healthLabel: '机会', progressLabel: '答对轮数', countLabel: '当前轮次'
  }
};
