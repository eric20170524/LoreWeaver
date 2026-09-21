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
