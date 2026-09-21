import reactionCard from '../../minigame_master/gameplay/cards/reaction_pick.json';

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
