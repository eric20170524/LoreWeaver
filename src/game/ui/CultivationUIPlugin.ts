import Phaser from 'phaser';
import type { GameSpec, PlayerState } from '../../types';
import type { UIPlugin, UIPluginContext } from './UIPlugin';
import { synth } from '../../utils/AudioSynth';
import { cultivationView, abilityRecorded, passivePurchaseStatus, purchasePassive } from './cultivationModel';

/** Shared cultivation shell. IP names/catalogs belong to the manifest. */
export class CultivationUIPlugin implements UIPlugin {
  private scoreText?: Phaser.GameObjects.Text;
  private multiplierText?: Phaser.GameObjects.Text;
  private caveBtn?: Phaser.GameObjects.Text;
  private realmBtn?: Phaser.GameObjects.Text;
  private perkBtn?: Phaser.GameObjects.Text;
  private abilityBtn?: Phaser.GameObjects.Text;
  private activeModalContainer: Phaser.GameObjects.Container | null = null;
  private state?: PlayerState;
  private spec?: GameSpec;

  renderTopHUD(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    this.state = state;
    this.spec = spec;
    const view = cultivationView(spec);
    const { width } = scene.scale;
    const color = Phaser.Display.Color.HexStringToColor(view.color).color;
    const bg = scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(16, 16, width - 32, 110, 8);
    bg.lineStyle(2, color, 0.8);
    bg.strokeRoundedRect(16, 16, width - 32, 110, 8);
    const realm = spec.economy.realms[state.currentRealmIndex] || spec.economy.realms[0] || '初始境界';
    scene.add.text(32, 28, `境界：${realm}`, {
      fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc'
    });
    this.multiplierText = scene.add.text(32, 57, '', { fontSize: '16px', color: '#cbd5e1' });
    this.scoreText = scene.add.text(32, 84, '', { fontSize: '20px', color: '#ffffff' });
    const sound = scene.add.text(width - 24, 30, synth.getMuteState() ? '静音' : '音效', {
      fontSize: '15px', color: '#cbd5e1', backgroundColor: '#334155', padding: { x: 8, y: 5 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    sound.on('pointerdown', () => {
      sound.setText(synth.toggleMute() ? '静音' : '音效');
      context.onLog('已切换游戏音效');
    });
    scene.events.once('shutdown', () => this.destroy());
    this.refreshHud();
  }

  private refreshHud() {
    if (!this.state || !this.spec) return;
    const view = cultivationView(this.spec);
    if (this.scoreText?.active) this.scoreText.setText(`${view.currency}储备：${Math.floor(this.state.mainCurrencyCount)}`);
    if (this.multiplierText?.active) this.multiplierText.setText(`${view.income}：+${(this.state.activeMultiplier * 1.5).toFixed(1)}/秒`);
  }

  renderClickCore(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext) {
    const { width, height } = scene.scale;
    const view = cultivationView(spec);
    const color = Phaser.Display.Color.HexStringToColor(view.color).color;
    const cx = width / 2;
    const cy = height - 260;
    const aura = scene.add.circle(cx, cy, 64, color, 0.2).setStrokeStyle(2, color, 0.8);
    const practice = scene.add.text(cx, cy, view.practice, {
      fontSize: '20px', color: '#ffffff', align: 'center', fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    practice.on('pointerdown', () => {
      const gain = Number((state.clickPower * 1.5).toFixed(1));
      state.mainCurrencyCount += gain;
      synth.playClick();
      scene.tweens.add({ targets: aura, scale: 0.92, yoyo: true, duration: 90 });
      this.refreshHud();
      context.saveStateToStore();
    });
    const panelY = height - 170;
    const bg = scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.96);
    bg.fillRoundedRect(20, panelY, width - 40, 160, 12);
    bg.lineStyle(2, color, 0.7);
    bg.strokeRoundedRect(20, panelY, width - 40, 160, 12);
    scene.add.text(width / 2, panelY + 22, view.panel, {
      fontSize: '20px', color: '#f8fafc', fontStyle: 'bold'
    }).setOrigin(0.5);
    const button = (x: number, y: number, label: string, action: () => void) => {
      const object = scene.add.text(x, y, label, {
        fontSize: '16px', color: '#fff', backgroundColor: view.color, padding: { x: 12, y: 8 }
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      object.on('pointerdown', action);
      return object;
    };
    const left = 20 + (width - 40) / 4;
    const right = width - left;
    this.caveBtn = button(left, panelY + 66, view.train, () => {
      const cost = 100 * (state.currentRealmIndex + 1);
      if (state.mainCurrencyCount < cost) {
        context.onLog(`${view.train}需要 ${cost} ${view.currency}`);
        synth.playDamage();
        return;
      }
      state.mainCurrencyCount -= cost;
      state.activeMultiplier += 0.5;
      state.clickPower += 0.5;
      this.refreshHud();
      context.saveStateToStore();
      context.onLog(`${view.train}完成：消耗 ${cost} ${view.currency}，点击与自动积累各 +0.5。`);
    });
    this.realmBtn = button(right, panelY + 66, view.breakthrough, () => {
      const cost = Math.pow(4, state.currentRealmIndex + 1) * 35;
      if (state.currentRealmIndex >= spec.economy.realms.length - 1 || state.mainCurrencyCount < cost) {
        context.onLog(`突破需要 ${cost} ${view.currency}，当前资源不足或已达最高境界。`);
        synth.playDamage();
        return;
      }
      state.mainCurrencyCount -= cost;
      state.currentRealmIndex += 1;
      state.activeMultiplier += 1.8;
      state.clickPower += 1.5;
      context.saveStateToStore();
      context.onLog(`突破至 ${spec.economy.realms[state.currentRealmIndex]}。`);
      synth.playBreakthrough();
      scene.scene.restart();
    });
    this.perkBtn = button(left, panelY + 117, view.passives, () => this.openCatalog(scene, state, spec, context, 'passives'));
    this.abilityBtn = button(right, panelY + 117, view.abilities, () => this.openCatalog(scene, state, spec, context, 'abilities'));
  }

  private closeModal() {
    this.activeModalContainer?.destroy();
    this.activeModalContainer = null;
  }

  private openCatalog(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext,
    kind: 'passives' | 'abilities', requestedPage = 0) {
    this.closeModal();
    const view = cultivationView(spec);
    const items = kind === 'passives' ? view.passivesCatalog : view.abilitiesCatalog;
    const { width, height } = scene.scale;
    const container = scene.add.container(0, 0).setDepth(200000);
    this.activeModalContainer = container;
    // Block the underlying game controls, but do not steal unrelated listeners.
    const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.88).setInteractive();
    overlay.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: any) => event?.stopPropagation());
    container.add(overlay);
    const panelW = Math.min(680, width - 32);
    const panelH = Math.min(660, height - 50);
    const x = (width - panelW) / 2;
    const y = (height - panelH) / 2;
    const box = scene.add.graphics();
    box.fillStyle(0x111827, 1);
    box.fillRoundedRect(x, y, panelW, panelH, 12);
    container.add(box);
    const text = (tx: number, ty: number, value: string, size = 15, color = '#cbd5e1', wrap = panelW - 48) => {
      const object = scene.add.text(tx, ty, value, {
        fontFamily: 'Inter, sans-serif', fontSize: `${size}px`, color,
        wordWrap: { width: wrap, useAdvancedWrap: true }
      });
      container.add(object);
      return object;
    };
    text(x + 20, y + 18, kind === 'passives' ? view.passives : view.abilities, 20, '#ffffff', panelW - 130);
    const close = text(x + panelW - 20, y + 18, '✕ 关闭', 15, '#fca5a5').setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closeModal());
    const note = kind === 'passives'
      ? `当前 ${view.currency}：${Math.floor(state.mainCurrencyCount)} · 规划中/未接入项不会扣费`
      : '图鉴仅记录初始或实际解锁能力，不代表全部战斗效果已实现。';
    text(x + 20, y + 54, note, 12);
    const itemH = 118;
    const pageSize = Math.max(1, Math.floor((panelH - 142) / itemH));
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(pages - 1, Math.max(0, requestedPage));
    if (!items.length) text(x + 20, y + 105, '当前主题尚未配置此目录；不会载入其他主题的默认内容。');
    items.slice(page * pageSize, (page + 1) * pageSize).forEach((item, index) => {
      const iy = y + 94 + index * itemH;
      text(x + 20, iy, item.name, 17, '#f8fafc');
      if (kind === 'passives') {
        const passive = view.passivesCatalog[page * pageSize + index];
        const status = passivePurchaseStatus(passive, state);
        const labels = {
          available: `研习：${passive.cost} ${view.currency}`, owned: '已研习', planned: '规划中 · 暂未开放',
          unsupported: '效果未接入 · 暂未开放', requires: `需先研习：${passive.requires}`, insufficient: `资源不足：需 ${passive.cost} ${view.currency}`
        };
        text(x + 20, iy + 27, passive.description, 12, '#94a3b8');
        const action = text(x + 20, iy + 77, labels[status], 14, status === 'available' ? '#6ee7b7' : '#fbbf24');
        if (status === 'available') {
          action.setInteractive({ useHandCursor: true });
          action.on('pointerdown', () => {
            if (purchasePassive(passive, state)) {
              synth.playClick();
              context.saveStateToStore();
              context.onLog(`已研习 ${passive.name}，消耗 ${passive.cost} ${view.currency}。`);
              this.refreshHud();
            }
            this.openCatalog(scene, state, spec, context, kind, page);
          });
        }
      } else {
        const ability = view.abilitiesCatalog[page * pageSize + index];
        const unlocked = abilityRecorded(ability, state);
        text(x + 20, iy + 27, unlocked ? ability.description : `解锁条件：${ability.unlockCondition || '等待关卡奖励'}`, 12, '#94a3b8');
        text(x + 20, iy + 77, unlocked ? '已记录 · 战斗效果以运行时实现为准' : '尚未解锁', 13, unlocked ? '#7dd3fc' : '#fbbf24');
      }
    });
    const footerY = y + panelH - 30;
    text(width / 2, footerY, `${page + 1} / ${pages}`, 14).setOrigin(0.5);
    if (page > 0) {
      const previous = text(x + 20, footerY - 8, '上一页', 14).setInteractive({ useHandCursor: true });
      previous.on('pointerdown', () => this.openCatalog(scene, state, spec, context, kind, page - 1));
    }
    if (page + 1 < pages) {
      const next = text(x + panelW - 20, footerY - 8, '下一页', 14).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      next.on('pointerdown', () => this.openCatalog(scene, state, spec, context, kind, page + 1));
    }
  }

  onIncomeTick(_scene: Phaser.Scene, _state: PlayerState, _increment: number) { this.refreshHud(); }
  update(_time: number, _delta: number) { this.refreshHud(); }
  destroy() {
    this.closeModal();
    this.scoreText = this.multiplierText = undefined;
    this.state = undefined;
    this.spec = undefined;
  }
}
