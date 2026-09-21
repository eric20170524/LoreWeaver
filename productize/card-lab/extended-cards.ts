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
  validate?: (knobs: Record<string, number>) => string | null;
  goal: (knobs: any) => number;
  progress: (state: any) => string;
  health: (state: any) => number;
  count: (state: any) => number;
  healthLabel: string;
  progressLabel: string;
  countLabel: string;
};

export const extraLabCards: Record<string, ExtraLabCard> = {
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
