import UIHelper from '../utils/UIHelper.js';
import NodeBridge from '../systems/NodeBridge.js';

export class Node1UI extends Phaser.Scene {
    constructor(key = 'Node1UI') {
        super({ key, active: false });
    }

    create(data) {
        this.parentScene = data.parent;
        this.width = 720;
        this.height = 1280;
        this.actionButtons = {};
        this.timeText = this.add.text(20, 20, '时间: 0 / 120', { fontSize: '24px', fill: '#fff' });
        this.killText = this.add.text(20, 60, '击杀: 0', { fontSize: '24px', fill: '#fff' });
        this.levelText = this.add.text(20, 100, '等级: 1', { fontSize: '24px', fill: '#ffd700' });
        this.expBarBg = this.add.graphics();
        this.expBarBg.fillStyle(0x222222, 0.8);
        this.expBarBg.fillRect(20, 140, 200, 20);
        this.expBar = this.add.graphics();
        this.updateExp(0, 20, 1);
        this.hpBarBg = this.add.graphics();
        this.hpBarBg.fillStyle(0x222222, 0.8);
        this.hpBarBg.fillRect(20, 180, 200, 20);
        this.hpBar = this.add.graphics();
        this.hpText = null;
        this.updateHp(this.parentScene.playerHp, this.parentScene.playerMaxHp);

        // Compact skill summary (full panel redesign is LW-022; keep height small).
        this.skillPanelBg = this.add.rectangle(20, 214, 320, 88, 0x071316, 0.78).setOrigin(0, 0);
        this.skillPanelBg.setStrokeStyle(2, 0x1f7774, 0.85);
        this.skillTitleText = this.add.text(34, 224, '自动宝术', { fontSize: '16px', fill: '#80ffea', fontStyle: 'bold' });
        this.skillText = this.add.text(34, 248, '', {
            fontSize: '15px',
            fill: '#ffffff',
            wordWrap: { width: 292, useAdvancedWrap: true },
            lineSpacing: 2
        });
        this.skillHintText = this.add.text(34, 278, '', { fontSize: '12px', fill: '#9dd9d2' });
        this.skillCastText = this.add.text(20, 310, '最近施展: —', { fontSize: '13px', fill: '#ffd27a' });
        this.updateSkills(this.parentScene.activeSkills || []);

        this.actionHelpText = this.add.text(this.width - 20, this.height - 360, 'Space/J/K · 闪避/术法/爆发', {
            fontSize: '12px',
            fill: '#9dd9d2'
        }).setOrigin(1, 1);

        this.createActionBar();

        this.retreatBtn = this.add.text(this.width - 80, 40, '撤退', {
            fontSize: '24px', fill: '#ffffff', backgroundColor: '#8b0000', padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive();
        UIHelper.bindButtonBounce(this.retreatBtn, () => this.showRetreatConfirm());
        this.events.once('shutdown', () => this.teardown());
        this.events.once('destroy', () => this.teardown());

        const snapshot = this.parentScene.playerActionController?.getHudSnapshot?.();
        if (snapshot) this.updateActionBar(snapshot);
    }

    createActionBar() {
        const size = 76;
        // Stable bottom-right action-button cluster (right thumb).
        const slots = {
            dash: { x: this.width - 36 - size / 2, y: this.height - 48 - size * 2 - 18 },
            active: { x: this.width - 36 - size / 2, y: this.height - 48 - size / 2 },
            burst: { x: this.width - 36 - size * 1.55 - 12, y: this.height - 48 - size / 2 }
        };

        // Explicit markers for maturity/source scanners and E2E.
        this.actionDashBtn = this.makeActionButton('dash', slots.dash.x, slots.dash.y, size, '闪避', '💨');
        this.actionActiveBtn = this.makeActionButton('active', slots.active.x, slots.active.y, size, '术法', '✊');
        this.actionBurstBtn = this.makeActionButton('burst', slots.burst.x, slots.burst.y, size, '爆发', '💥');
        this.skillActionBtn = this.actionActiveBtn;
        this.actionButtons = {
            dash: this.actionDashBtn,
            active: this.actionActiveBtn,
            burst: this.actionBurstBtn
        };
    }

    makeActionButton(actionId, x, y, size, label, icon) {
        const container = this.add.container(x, y).setDepth(50).setScrollFactor(0);
        const hit = this.add.circle(0, 0, size / 2, 0x0b1f24, 0.88)
            .setStrokeStyle(3, 0x80ffea, 0.9)
            .setInteractive({ useHandCursor: true });
        // Dom markers for tests / scanners (Phaser game object names).
        hit.setName(`action-button-${actionId}`);
        hit.setData('actionId', actionId);
        hit.setData('role', 'skill-button');

        const iconText = this.add.text(0, -8, icon, { fontSize: '28px' }).setOrigin(0.5);
        const labelText = this.add.text(0, 18, label, {
            fontSize: '13px',
            fill: '#e8fffa',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        const keyText = this.add.text(0, size / 2 - 2, '', {
            fontSize: '11px',
            fill: '#9dd9d2'
        }).setOrigin(0.5, 1);
        const cdOverlay = this.add.graphics();
        const chargeRing = this.add.graphics();
        const statusText = this.add.text(0, -size / 2 + 4, '', {
            fontSize: '11px',
            fill: '#ffd27a'
        }).setOrigin(0.5, 0);

        container.add([hit, chargeRing, cdOverlay, iconText, labelText, keyText, statusText]);
        container.setSize(size, size);

        const widget = {
            id: actionId,
            container,
            hit,
            iconText,
            labelText,
            keyText,
            cdOverlay,
            chargeRing,
            statusText,
            size,
            pressed: false
        };

        hit.on('pointerdown', (pointer) => {
            pointer?.event?.stopPropagation?.();
            widget.pressed = true;
            container.setScale(0.94);
            this.parentScene?.playerActionController?.tryAction?.(actionId, 'touch');
        });
        hit.on('pointerup', () => {
            widget.pressed = false;
            container.setScale(1);
        });
        hit.on('pointerout', () => {
            widget.pressed = false;
            container.setScale(1);
        });

        return widget;
    }

    updateActionBar(snapshot) {
        if (!snapshot?.actions || !this.actionButtons) return;
        for (const action of snapshot.actions) {
            const widget = this.actionButtons[action.id];
            if (!widget) continue;
            widget.labelText.setText(action.label?.slice(0, 4) || action.id);
            widget.iconText.setText(action.icon || '•');
            widget.keyText.setText(action.keyLabel || '');

            const available = Boolean(action.available);
            const alpha = available ? 1 : 0.55;
            widget.container.setAlpha(alpha);
            widget.hit.setFillStyle(available ? 0x0f3a3a : 0x1a1a1a, 0.9);
            widget.hit.setStrokeStyle(3, available ? 0x80ffea : 0x555555, available ? 0.95 : 0.55);

            widget.cdOverlay.clear();
            if (action.cooldownRatio > 0.01) {
                const radius = widget.size / 2 - 2;
                widget.cdOverlay.fillStyle(0x000000, 0.45);
                widget.cdOverlay.slice(
                    0,
                    0,
                    radius,
                    Phaser.Math.DegToRad(-90),
                    Phaser.Math.DegToRad(-90 + 360 * action.cooldownRatio),
                    false
                );
                widget.cdOverlay.fillPath();
            }

            widget.chargeRing.clear();
            if (action.id === 'burst' && action.chargeMax) {
                const ratio = Math.min(1, (action.charge || 0) / action.chargeMax);
                widget.chargeRing.lineStyle(4, ratio >= 1 ? 0xffd27a : 0x4aa8ff, 0.95);
                widget.chargeRing.beginPath();
                widget.chargeRing.arc(
                    0,
                    0,
                    widget.size / 2 + 4,
                    Phaser.Math.DegToRad(-90),
                    Phaser.Math.DegToRad(-90 + 360 * ratio),
                    false
                );
                widget.chargeRing.strokePath();
                widget.statusText.setText(ratio >= 1 ? '就绪' : `${Math.floor(ratio * 100)}%`);
            } else if (!available && action.reason === 'cooldown') {
                widget.statusText.setText(`${Math.ceil((action.remainingMs || 0) / 100) / 10}s`);
            } else {
                widget.statusText.setText(available ? '' : '');
            }
        }
    }

    teardown() {
        this.hpTween?.stop?.();
        this.hpTween = null;
        this.retreatConfirmCleanup?.();
        this.retreatConfirmCleanup = null;
        this.actionButtons = {};
        this.actionDashBtn = null;
        this.actionActiveBtn = null;
        this.actionBurstBtn = null;
        this.skillActionBtn = null;
    }

    showRetreatConfirm() {
        if (this.retreatConfirmOpen) return;
        this.retreatConfirmOpen = true;
        if (this.parentScene?.enterInputPause) this.parentScene.enterInputPause('retreat_confirm');
        else {
            this.parentScene.isPaused = true;
            this.parentScene.physics.pause();
        }
        const modalBg = this.add.rectangle(this.width / 2, this.height / 2, 400, 200, 0x000000, 0.9).setDepth(100);
        modalBg.setStrokeStyle(4, 0xff0000);
        const title = this.add.text(this.width / 2, this.height / 2 - 50, '确认要撤退吗？', { fontSize: '28px', fill: '#ffffff' }).setOrigin(0.5).setDepth(101);
        const desc = this.add.text(this.width / 2, this.height / 2, '现在撤退将损失 50% 战利品！', { fontSize: '18px', fill: '#aaaaaa' }).setOrigin(0.5).setDepth(101);
        const confirmBtn = this.add.text(this.width / 2 - 80, this.height / 2 + 50, '撤退', { fontSize: '24px', fill: '#ff0000', backgroundColor: '#333333', padding: { x: 15, y: 8 } }).setOrigin(0.5).setInteractive().setDepth(101);
        const cancelBtn = this.add.text(this.width / 2 + 80, this.height / 2 + 50, '继续', { fontSize: '24px', fill: '#00ff00', backgroundColor: '#333333', padding: { x: 15, y: 8 } }).setOrigin(0.5).setInteractive().setDepth(101);
        const cleanup = () => {
            this.retreatConfirmOpen = false;
            modalBg.destroy(); title.destroy(); desc.destroy(); confirmBtn.destroy(); cancelBtn.destroy();
            this.retreatConfirmCleanup = null;
        };
        this.retreatConfirmCleanup = cleanup;
        UIHelper.bindButtonBounce(cancelBtn, () => {
            cleanup();
            if (this.parentScene?.exitInputPause) this.parentScene.exitInputPause('retreat_confirm');
            else {
                this.parentScene.isPaused = false;
                this.parentScene.physics.resume();
            }
        });
        UIHelper.bindButtonBounce(confirmBtn, () => {
            cleanup();
            this.parentScene.endGame(false, '主动撤退', NodeBridge.RESULT_REASONS.RETREATED);
        });
    }

    updateTime(current, max) { this.timeText.setText(`时间: ${current} / ${max}`); }
    updateKills(kills) { this.killText.setText(`击杀: ${kills}`); }

    updateSkills(activeSkills = []) {
        if (!this.skillTitleText || !this.skillText || !this.skillHintText) return;
        const manualIds = new Set(this.parentScene?.playerActionController?.getBoundManualSkillIds?.() || []);
        const autoSkills = activeSkills.filter((skill) => !manualIds.has(skill.id));
        const rows = autoSkills.map((skillState) => {
            const skillData = this.parentScene?.findSkillData?.(skillState.id);
            return `${skillData?.name || skillState.id} Lv.${skillState.level}`;
        });
        const overflow = Math.max(rows.length - 2, 0);
        const visibleRows = rows.slice(0, 2);
        if (overflow > 0) visibleRows.push(`另有 ${overflow} 项自动运行`);
        const candidateCount = this.parentScene?.availableSkillPool?.length || 0;
        this.skillTitleText.setText(`自动宝术 (${autoSkills.length})`);
        this.skillText.setText(visibleRows.length > 0 ? visibleRows.join('\n') : '仅基础自动拳');
        this.skillHintText.setText(`候选 ${candidateCount} · 闪避/术法/爆发需主动`);
    }

    updateLastCast(skillName, level) {
        this.skillCastText?.setText(`最近施展: ${skillName} Lv.${level}`);
    }

    updateExp(current, max, level) {
        this.levelText.setText(`等级: ${level}`);
        this.expBar.clear();
        this.expBar.fillStyle(0x00aaff, 1);
        this.expBar.fillRect(20, 140, 200 * Math.min(current / max, 1), 20);
    }

    updateHp(current, max) {
        if (!this.hpDisplay) this.hpDisplay = { value: current };
        this.hpTween?.stop?.();
        const drawHp = (value) => {
            this.hpBar.clear();
            this.hpBar.fillStyle(0xff0000, 1);
            this.hpBar.fillRect(20, 180, 200 * Math.max(Math.min(value / max, 1), 0), 20);
            if (!this.hpText) this.hpText = this.add.text(230, 178, `${Math.ceil(current)} / ${max}`, { fontSize: '18px', fill: '#ff4444', fontStyle: 'bold' });
            else this.hpText.setText(`${Math.ceil(current)} / ${max}`);
        };
        this.hpTween = this.tweens.add({
            targets: this.hpDisplay, value: current, duration: 180, ease: 'Sine.easeOut',
            onUpdate: () => drawHp(this.hpDisplay.value), onComplete: () => drawHp(current)
        });
        drawHp(this.hpDisplay.value);
    }
}
