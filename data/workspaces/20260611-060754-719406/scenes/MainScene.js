// scenes/MainScene.js
// 主干打坐修炼与节点入口场景 - 转换为 ES Modules

import store from '../js/store.js';
import IdleEngine from '../js/IdleEngine.js';
import UIHelper from '../utils/UIHelper.js';
import NodeBridge from '../systems/NodeBridge.js';
import { NODE_REGISTRY, REALM_REGISTRY, CAVE_COST_REGISTRY, CHARACTER_DESIGN_CATALOG } from '../js/data.js';

export class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    create(data) {
        this.width = 720;
        this.height = 1280;

        // 检查是否有 Node 结算返回
        if (data && data.lastNodeResult) {
            console.log("从 Node 返回，结算结果:", data.lastNodeResult);
        }

        // 初始化挂机引擎
        this.idleEngine = new IdleEngine(store);
        this.idleEngine.start((gain) => {
            this.updateUI();
        }, this);

        // 监听场景的 shutdown 事件，自动清理引擎
        this.events.once('shutdown', () => {
            if (this.idleEngine) {
                this.idleEngine.stop();
            }
        });

        this.createUI();
        this.updateUI();
    }

    createUI() {
        const centerX = this.width / 2;

        // 顶部资源栏
        this.resourceText = this.add.text(centerX, 40, '', { fontSize: '24px', fill: '#fff' }).setOrigin(0.5);
        
        // 境界信息
        this.realmText = this.add.text(centerX, 90, '', { fontSize: '28px', fill: '#ffd700' }).setOrigin(0.5);

        // 挂机收益信息
        this.idleText = this.add.text(centerX, 140, '', { fontSize: '20px', fill: '#aaa' }).setOrigin(0.5);

        this.abilityText = this.add.text(centerX, 185, '', {
            fontSize: '18px',
            fill: '#80ffea',
            align: 'center',
            wordWrap: { width: 640, useAdvancedWrap: true }
        }).setOrigin(0.5);

        // 节点入口列表
        this.createNodeButtons(centerX);

        this.createHeroShowcase(centerX);

        // 下方面板
        this.createUpgradePanel(centerX);
    }

    createHeroShowcase(centerX) {
        this.heroShowcase = this.add.dom(centerX, 680).createFromHTML(this.getHeroShowcaseHtml());
        this.heroShowcase.setDepth(20);
    }

    escapeHtml(value = '') {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    getHeroShowcaseHtml() {
        const character = CHARACTER_DESIGN_CATALOG.find(item => item.role === 'player_character') || CHARACTER_DESIGN_CATALOG[0] || {
            name: '星骁 / 小猎者',
            combatIdentity: '高机动自动施法割草主角，洞天、骨文与星骨逐步觉醒。'
        };
        const heroName = this.escapeHtml(character.name);
        const combatIdentity = this.escapeHtml(character.combatIdentity);

        return `
            <div style="
                width: 590px;
                height: 164px;
                box-sizing: border-box;
                display: grid;
                grid-template-columns: 136px 1fr;
                gap: 16px;
                align-items: center;
                padding: 14px 18px;
                border: 2px solid rgba(255, 215, 0, 0.24);
                border-radius: 12px;
                background: linear-gradient(180deg, rgba(40, 24, 12, 0.92), rgba(8, 6, 5, 0.9));
                box-shadow: inset 0 0 26px rgba(245, 158, 11, 0.11), 0 12px 32px rgba(0, 0, 0, 0.34);
                color: #fef3c7;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                pointer-events: none;
                user-select: none;
            ">
                <svg viewBox="0 0 240 240" role="img" aria-label="星骁洞天骨文动画" style="width: 132px; height: 132px; overflow: visible;">
                    <defs>
                        <radialGradient id="mainHeroAuraGradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.22" />
                            <stop offset="52%" stop-color="#f59e0b" stop-opacity="0.14" />
                            <stop offset="100%" stop-color="#fef3c7" stop-opacity="0" />
                        </radialGradient>
                        <linearGradient id="mainHeroBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#fef3c7" />
                            <stop offset="48%" stop-color="#b77935" />
                            <stop offset="100%" stop-color="#4c2b13" />
                        </linearGradient>
                        <filter id="mainHeroGlow" x="-40%" y="-40%" width="180%" height="180%">
                            <feGaussianBlur stdDeviation="3.2" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <circle cx="120" cy="120" r="94" fill="url(#mainHeroAuraGradient)" />
                    <g fill="none" filter="url(#mainHeroGlow)" transform-origin="120 120">
                        <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 120 120" to="360 120 120" dur="8s" repeatCount="indefinite" />
                        <circle cx="120" cy="120" r="74" stroke="#38bdf8" stroke-width="2" stroke-dasharray="10 12" />
                        <circle cx="120" cy="120" r="56" stroke="#fef3c7" stroke-width="1.5" stroke-dasharray="4 10" />
                    </g>
                    <g transform-origin="120 120">
                        <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 120 120" to="360 120 120" dur="5.6s" repeatCount="indefinite" />
                        ${Array.from({ length: 10 }).map((_, index) => {
                            const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
                            const x = 120 + Math.cos(angle) * 78;
                            const y = 120 + Math.sin(angle) * 78;
                            return `<circle class="hero-cave-dot" data-cave="${index + 1}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6" fill="${index % 2 === 0 ? '#fef3c7' : '#38bdf8'}" opacity="0.55" />`;
                        }).join('')}
                    </g>
                    <g filter="url(#mainHeroGlow)">
                        <animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0;0 -2;0 0" dur="2.2s" repeatCount="indefinite" />
                        <ellipse cx="120" cy="188" rx="34" ry="10" fill="#020617" opacity="0.55" />
                        <path d="M92 151 C95 121 103 99 120 99 C137 99 145 121 148 151 L138 180 L102 180 Z" fill="url(#mainHeroBodyGradient)" />
                        <path d="M94 149 C75 146 63 132 59 113" stroke="#f59e0b" stroke-width="9" stroke-linecap="round" />
                        <path d="M146 149 C165 145 177 131 181 112" stroke="#f59e0b" stroke-width="9" stroke-linecap="round" />
                        <circle cx="120" cy="79" r="23" fill="#f2c28b" />
                        <path d="M95 74 C101 48 138 48 146 76 C135 67 112 65 95 74 Z" fill="#1f1309" />
                        <path d="M104 130 C112 137 128 137 136 130 L132 158 L108 158 Z" fill="#fef3c7" opacity="0.88" />
                        <circle cx="120" cy="137" r="8" fill="#38bdf8">
                            <animate attributeName="r" values="7;10;7" dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.75;1;0.75" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <path d="M108 87 Q120 94 132 87" stroke="#4c2b13" stroke-width="3" stroke-linecap="round" fill="none" />
                        <circle cx="111" cy="78" r="2.6" fill="#111827" />
                        <circle cx="129" cy="78" r="2.6" fill="#111827" />
                    </g>
                    <g fill="none">
                        <animate attributeName="opacity" values="0.35;0.9;0.35" dur="2.8s" repeatCount="indefinite" />
                        <path d="M76 99 C92 107 99 119 101 136" stroke="#fef3c7" stroke-width="1.4" />
                        <path d="M164 99 C148 107 141 119 139 136" stroke="#fef3c7" stroke-width="1.4" />
                        <path d="M100 185 C111 195 129 195 140 185" stroke="#38bdf8" stroke-width="1.4" />
                    </g>
                </svg>
                <div style="min-width: 0;">
                    <div style="font-size: 15px; color: #f59e0b; font-weight: 800; letter-spacing: 0.04em;">主角形象展示</div>
                    <div style="margin-top: 4px; font-size: 23px; color: #ffffff; font-weight: 900; line-height: 1.18;">${heroName}</div>
                    <div style="margin-top: 5px; font-size: 12px; color: #cbbba8; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${combatIdentity}</div>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div style="border: 1px solid rgba(245, 158, 11, 0.18); border-radius: 8px; padding: 7px 8px; background: rgba(0, 0, 0, 0.18);">
                            <div style="font-size: 10px; color: #8f8171;">当前境界</div>
                            <div data-hero-realm style="margin-top: 3px; font-size: 13px; color: #fef3c7; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">搬血境</div>
                        </div>
                        <div style="border: 1px solid rgba(245, 158, 11, 0.18); border-radius: 8px; padding: 7px 8px; background: rgba(0, 0, 0, 0.18);">
                            <div style="font-size: 10px; color: #8f8171;">洞天状态</div>
                            <div data-hero-caves style="margin-top: 3px; font-size: 13px; color: #fef3c7; font-weight: 800;">0 / 3</div>
                        </div>
                        <div style="border: 1px solid rgba(245, 158, 11, 0.18); border-radius: 8px; padding: 7px 8px; background: rgba(0, 0, 0, 0.18);">
                            <div style="font-size: 10px; color: #8f8171;">骨文光环</div>
                            <div data-hero-runes style="margin-top: 3px; font-size: 13px; color: #fef3c7; font-weight: 800;">原始真解</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updateHeroShowcase(realmData, caves, abilityNames) {
        if (!this.heroShowcase || !this.heroShowcase.node) return;

        const root = this.heroShowcase.node;
        const realmEl = root.querySelector('[data-hero-realm]');
        const cavesEl = root.querySelector('[data-hero-caves]');
        const runesEl = root.querySelector('[data-hero-runes]');
        const caveMax = realmData?.caveCount || 3;
        const activeCaveCount = Math.min(10, caves);

        if (realmEl) realmEl.textContent = realmData?.name || store.get('progression.realmName') || '搬血境';
        if (cavesEl) cavesEl.textContent = `${caves} / ${caveMax}`;
        if (runesEl) runesEl.textContent = abilityNames.length > 0 ? `${abilityNames.length} 门宝术` : '原始真解';

        root.querySelectorAll('.hero-cave-dot').forEach((dot, index) => {
            const active = index < activeCaveCount;
            dot.setAttribute('opacity', active ? '0.96' : '0.28');
            dot.setAttribute('r', active ? '5.2' : '3.2');
        });
    }

    createNodeButtons(centerX) {
        this.nodeListContainer = this.add.container(0, 0);
        if (this.currentPage === undefined) {
            this.currentPage = 0;
        }
        this.itemsPerPage = 4; // 每页显示4个关卡，防止纵向溢出
        
        this.renderNodePage(centerX);
    }

    getNodeSkillPreview(node) {
        const skills = store.getAvailableSkillPool(node.skillTierAvailable, node);
        const skillNames = skills.map(skill => skill.name);
        const visibleSkillNames = skillNames.slice(0, 6);
        const skillOverflow = Math.max(skillNames.length - visibleSkillNames.length, 0);
        const skillText = visibleSkillNames.length > 0
            ? `${visibleSkillNames.join(' / ')}${skillOverflow > 0 ? ` 等${skillNames.length}项` : ''}`
            : '暂无可用宝术';

        const unlocked = new Set(store.getUnlockedAbilities());
        const rewardAbilityNames = (node.planning?.rewardUnlocks || [])
            .filter(abilityId => !unlocked.has(abilityId))
            .map(abilityId => store.getAbilityName(abilityId));
        const rewardText = rewardAbilityNames.length > 0
            ? `首通可悟: ${rewardAbilityNames.join(' / ')}`
            : '首通宝术: 已掌握或无新增';

        return { skillText, rewardText };
    }

    renderNodePage(centerX) {
        this.nodeListContainer.removeAll(true);
        const startY = 240;
        const spacing = 80;
        const listX = centerX;

        const totalNodes = NODE_REGISTRY.length;
        const totalPages = Math.ceil(totalNodes / this.itemsPerPage);
        const startIndex = this.currentPage * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, totalNodes);

        const nodeResults = store.get('nodeResults') || {};
        const currentRealm = store.get('progression.realm') || 1;
        for (let i = startIndex; i < endIndex; i++) {
            const node = NODE_REGISTRY[i];
            const isUnlocked = store.get('unlockedNodes').includes(node.id);
            const isRealmEligible = currentRealm >= node.realmRequired;
            const color = isUnlocked && isRealmEligible ? '#006400' : (isUnlocked ? '#725400' : '#333333');
            const textFill = isUnlocked ? '#ffffff' : '#777777';

            const isCompleted = nodeResults[node.id] && nodeResults[node.id].success;
            const completionMark = isCompleted ? " [已通关]" : "";
            const requiredRealm = REALM_REGISTRY.find(realm => realm.id === node.realmRequired);
            const eligibilityMark = isUnlocked && !isRealmEligible ? ` [需${requiredRealm?.name || `境界${node.realmRequired}`}]` : "";

            const btnY = startY + (i - startIndex) * spacing;
            const btn = this.add.text(listX, btnY, `${node.name} - ${node.subtitle}${completionMark}${eligibilityMark}`, {
                fontSize: '24px',
                fill: textFill,
                backgroundColor: color,
                padding: { x: 20, y: 10 }
            }).setOrigin(0.5);

            this.nodeListContainer.add(btn);

            if (isUnlocked && isRealmEligible) {
                btn.setInteractive();
                UIHelper.bindButtonBounce(btn, () => {
                    // 战前动员
                    const introText = node.intro || "前方凶险，荒域危机四伏。";
                    const gameplayDesc = node.description ? `【本关玩法】${node.description}\n` : "";
                    const descTextContent = `${gameplayDesc}${introText}`;
                    const title = `[ ${node.name} - ${node.subtitle} ]`;
                    const preview = this.getNodeSkillPreview(node);
                    
                    const modalBg = this.add.rectangle(this.width/2, this.height/2, 600, 460, 0x000000, 0.86).setDepth(100);
                    modalBg.setStrokeStyle(4, 0x8b0000);
                    
                    const tText = this.add.text(this.width/2, this.height/2 - 186, title, { fontSize: "32px", fill: "#ffd700", fontStyle: "bold" }).setOrigin(0.5).setDepth(101);
                    const descText = this.add.text(this.width/2, this.height/2 - 110, descTextContent, { fontSize: "19px", fill: "#ffffff", wordWrap: { width: 540, useAdvancedWrap: true }, align: "center" }).setOrigin(0.5).setDepth(101);
                    const skillLabel = this.add.text(this.width/2, this.height/2 - 18, "本关候选宝术", { fontSize: "21px", fill: "#80ffea", fontStyle: "bold" }).setOrigin(0.5).setDepth(101);
                    const skillText = this.add.text(this.width/2, this.height/2 + 40, preview.skillText, {
                        fontSize: "20px",
                        fill: "#e7fff9",
                        wordWrap: { width: 540, useAdvancedWrap: true },
                        align: "center"
                    }).setOrigin(0.5).setDepth(101);
                    const rewardText = this.add.text(this.width/2, this.height/2 + 124, preview.rewardText, {
                        fontSize: "20px",
                        fill: "#ffd700",
                        wordWrap: { width: 540, useAdvancedWrap: true },
                        align: "center"
                    }).setOrigin(0.5).setDepth(101);
                    
                    const confirmBtn = this.add.text(this.width/2, this.height/2 + 190, "出战！", { fontSize: "28px", fill: "#ffffff", backgroundColor: "#8b0000", padding: { x: 25, y: 12 } }).setOrigin(0.5).setInteractive().setDepth(101);
                    const closeBtn = this.add.text(this.width/2 + 270, this.height/2 - 204, "X", { fontSize: "28px", fill: "#ff0000" }).setOrigin(0.5).setInteractive().setDepth(101);
                    
                    const cleanup = () => {
                        modalBg.destroy();
                        tText.destroy();
                        descText.destroy();
                        skillLabel.destroy();
                        skillText.destroy();
                        rewardText.destroy();
                        confirmBtn.destroy();
                        closeBtn.destroy();
                    };
                    
                    UIHelper.bindButtonBounce(closeBtn, cleanup);
                    UIHelper.bindButtonBounce(confirmBtn, () => {
                        cleanup();
                        NodeBridge.launchNode(this, node.id);
                    });
                });
                btn.on("pointerover", () => btn.setStyle({ fill: "#ffd700" }));
                btn.on("pointerout", () => btn.setStyle({ fill: "#ffffff" }));
            } else if (isUnlocked) {
                btn.setInteractive();
                UIHelper.bindButtonBounce(btn, () => {
                    UIHelper.showFloatText(
                        this,
                        this.width / 2,
                        this.height / 2,
                        `需先突破至${requiredRealm?.name || `境界 ${node.realmRequired}`}，再从此处出战。`,
                        "#ffd166",
                        2600
                    );
                });
            }
        }

        // 分页控制按钮
        const pageBtnY = startY + this.itemsPerPage * spacing + 10;
        
        if (this.currentPage > 0) {
            const prevBtn = this.add.text(listX - 80, pageBtnY, "上一页", { fontSize: '20px', fill: '#fff', backgroundColor: '#555', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive();
            UIHelper.bindButtonBounce(prevBtn, () => {
                this.currentPage--;
                this.renderNodePage(centerX);
            });
            this.nodeListContainer.add(prevBtn);
        }

        if (this.currentPage < totalPages - 1) {
            const nextBtn = this.add.text(listX + 80, pageBtnY, "下一页", { fontSize: '20px', fill: '#fff', backgroundColor: '#555', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive();
            UIHelper.bindButtonBounce(nextBtn, () => {
                this.currentPage++;
                this.renderNodePage(centerX);
            });
            this.nodeListContainer.add(nextBtn);
        }
        
        const pageText = this.add.text(listX, pageBtnY, `${this.currentPage + 1} / ${totalPages}`, { fontSize: '18px', fill: '#aaa' }).setOrigin(0.5);
        this.nodeListContainer.add(pageText);
    }

    createUpgradePanel(centerX) {
        // 固定布局面板，居中且位于底部
        const panelWidth = 600;
        const panelY = 800;
        
        this.upgradeBg = this.add.rectangle(centerX - panelWidth/2, panelY, panelWidth, 430, 0x333333).setOrigin(0, 0);
        this.upgradeBg.setStrokeStyle(2, 0xaaaaaa);

        this.add.text(centerX, panelY + 40, '【 修炼面板 】', { fontSize: '28px', fill: '#ffd700' }).setOrigin(0.5);

        // 开启洞天按钮
        this.caveBtn = this.add.text(centerX, panelY + 120, '开启洞天', {
            fontSize: '24px', fill: '#fff', backgroundColor: '#555', padding: {x:20, y:10}
        }).setOrigin(0.5).setInteractive();

        UIHelper.bindButtonBounce(this.caveBtn, () => {
            this.tryOpenCave();
        });
        this.caveBtn.on('pointerover', () => this.caveBtn.setStyle({ fill: '#ffd700' }));
        this.caveBtn.on('pointerout', () => this.caveBtn.setStyle({ fill: '#ffffff' }));

        // 突破境界按钮
        this.realmBtn = this.add.text(centerX, panelY + 200, '突破境界', {
            fontSize: '24px', fill: '#fff', backgroundColor: '#8b0000', padding: {x:20, y:10}
        }).setOrigin(0.5).setInteractive();

        UIHelper.bindButtonBounce(this.realmBtn, () => {
            this.tryBreakthrough();
        });
        this.realmBtn.on('pointerover', () => this.realmBtn.setStyle({ fill: '#ffd700' }));
        this.realmBtn.on('pointerout', () => this.realmBtn.setStyle({ fill: '#ffffff' }));

        // 参悟骨文按钮
        this.perkBtn = this.add.text(centerX, panelY + 280, '参悟骨文 (被动树)', {
            fontSize: '24px', fill: '#fff', backgroundColor: '#00008b', padding: {x:20, y:10}
        }).setOrigin(0.5).setInteractive();

        UIHelper.bindButtonBounce(this.perkBtn, () => {
            this.scene.start('PerkTreeScene');
        });
        this.perkBtn.on('pointerover', () => this.perkBtn.setStyle({ fill: '#ffd700' }));
        this.perkBtn.on('pointerout', () => this.perkBtn.setStyle({ fill: '#ffffff' }));

        this.abilityBtn = this.add.text(centerX, panelY + 348, '查看宝术图鉴', {
            fontSize: '22px', fill: '#fff', backgroundColor: '#075985', padding: {x:18, y:9}
        }).setOrigin(0.5).setInteractive();

        UIHelper.bindButtonBounce(this.abilityBtn, () => {
            this.scene.start('AbilityCodexScene');
        });
        this.abilityBtn.on('pointerover', () => this.abilityBtn.setStyle({ fill: '#ffd700' }));
        this.abilityBtn.on('pointerout', () => this.abilityBtn.setStyle({ fill: '#ffffff' }));
    }

    tryOpenCave() {
        const currentRealmId = store.get('progression.realm');
        const realmData = REALM_REGISTRY.find(r => r.id === currentRealmId);
        const cavesOpened = store.get('progression.cavesOpened');
        
        if (cavesOpened.length >= realmData.caveCount) {
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, "当前境界洞天已满，请先突破境界！", "#ED0B0B");
            return;
        }

        const nextCaveIndex = cavesOpened.length + 1;
        const caveData = CAVE_COST_REGISTRY.find(c => c.index === nextCaveIndex);
        
        if (!caveData) {
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, "已达到最高洞天数！", "#ED0B0B");
            return;
        }

        if (store.spendResource('bloodEssence', caveData.cost)) {
            cavesOpened.push(nextCaveIndex);
            store.set('progression.cavesOpened', cavesOpened);
            this.updateUI();
            // 播放音效或特效
            this.cameras.main.flash(200, 255, 215, 0);
            UIHelper.showFloatText(this, this.width / 2, this.height / 2 - 50, `成功开启第 ${nextCaveIndex} 洞天！`, "#00ff00");
        } else {
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, `气血精华不足！需要 ${caveData.cost}`, "#ED0B0B");
        }
    }

    tryBreakthrough() {
        const currentRealmId = store.get('progression.realm');
        const realmData = REALM_REGISTRY.find(r => r.id === currentRealmId);
        const cavesOpened = store.get('progression.cavesOpened');

        if (cavesOpened.length < realmData.caveCount) {
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, `需要开启 ${realmData.caveCount} 口洞天才能突破！`, "#ED0B0B");
            return;
        }

        const nextRealmData = REALM_REGISTRY.find(r => r.id === currentRealmId + 1);
        if (!nextRealmData) {
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, "已达到最高境界！", "#ED0B0B");
            return;
        }

        const costs = nextRealmData.breakthroughCost || { bloodEssence: nextRealmData.totalCaveCost };
        const check = store.checkResources(costs);
        if (check.success) {
            store.spendResources(costs);
            store.set('progression.realm', nextRealmData.id);
            store.set('progression.realmName', nextRealmData.name);
            
            // 解锁新 Node
            const unlockedNodes = store.get('unlockedNodes');
            nextRealmData.unlockNodes.forEach(nodeId => {
                if (!unlockedNodes.includes(nodeId)) {
                    unlockedNodes.push(nodeId);
                }
            });
            store.set('unlockedNodes', unlockedNodes);

            UIHelper.showFloatText(this, this.width / 2, this.height / 2 - 50, `境界突破：${nextRealmData.name}！`, "#ffd700", 3000);
            this.time.delayedCall(1500, () => {
                this.scene.restart(); // 刷新整个场景以重绘 Node 按钮
            });
        } else {
            const resourceNames = {
                bloodEssence: "气血精华",
                suanBoneScript: "雷吼骨文",
                pureBlood: "纯血宝血"
            };
            const name = resourceNames[check.missing] || check.missing;
            UIHelper.showFloatText(this, this.width / 2, this.height / 2, `突破失败！缺少 ${check.needed} ${name}`, "#ED0B0B");
        }
    }

    updateUI() {
        const res = store.get('resources');
        this.resourceText.setText(`气血精华: ${res.bloodEssence} | 雷吼骨文: ${res.suanBoneScript} | 纯血宝血: ${res.pureBlood}`);
        
        const realmName = store.get('progression.realmName');
        const caves = store.get('progression.cavesOpened').length;
        this.realmText.setText(`境界: ${realmName} (洞天: ${caves})`);

        this.idleText.setText(`挂机收益: ${this.idleEngine.getRate()} 气血/秒`);

        const abilityNames = store.getUnlockedAbilities().map(abilityId => store.getAbilityName(abilityId));
        this.abilityText.setText(`已悟宝术: ${abilityNames.join(' / ')}`);

        // 更新按钮文本状态
        const currentRealmId = store.get('progression.realm');
        const realmData = REALM_REGISTRY.find(r => r.id === currentRealmId);
        this.updateHeroShowcase(realmData, caves, abilityNames);
        const nextCaveIndex = caves + 1;
        const caveData = CAVE_COST_REGISTRY.find(c => c.index === nextCaveIndex);

        if (caves < realmData.caveCount && caveData) {
            this.caveBtn.setText(`开启洞天 (消耗: ${caveData.cost})`);
        } else {
            this.caveBtn.setText(`洞天已满`);
        }

        const nextRealmData = REALM_REGISTRY.find(r => r.id === currentRealmId + 1);
        if (nextRealmData) {
            const costs = nextRealmData.breakthroughCost || { bloodEssence: nextRealmData.totalCaveCost };
            const costStrings = [];
            if (costs.bloodEssence) costStrings.push(`${costs.bloodEssence}气血`);
            if (costs.suanBoneScript) costStrings.push(`${costs.suanBoneScript}骨文`);
            if (costs.pureBlood) costStrings.push(`${costs.pureBlood}宝血`);
            this.realmBtn.setText(`突破境界 (消耗: ${costStrings.join('/')})`);
        } else {
            this.realmBtn.setText(`已至巅峰`);
        }
    }

    shutdown() {
        if (this.idleEngine) {
            this.idleEngine.stop();
        }
    }
}

export default MainScene;
