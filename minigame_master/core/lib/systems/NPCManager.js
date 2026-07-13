// systems/NPCManager.js

import Colors from '../utils/Colors.js';

export default class NPCManager {
    constructor(scene) {
        this.scene = scene;
        this.npcs = [];
    }

    createNPC(x, y, name, hasQuestion) {
        const npc = this.scene.add.container(x, y);
        
        // NPC图形
        const graphics = this.scene.add.graphics();
        
        // 身体
        graphics.fillStyle(Colors.NPC_SHIRT_1, 1);
        graphics.fillRect(-15, 0, 30, 40);
        
        // 头部
        graphics.fillStyle(Colors.NPC_SKIN, 1);
        graphics.fillCircle(0, -10, 18);
        
        // 头发
        graphics.fillStyle(Colors.NPC_HAIR, 1);
        graphics.fillCircle(-8, -18, 10);
        graphics.fillCircle(0, -20, 10);
        graphics.fillCircle(8, -18, 10);
        
        // 眼睛
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(-6, -10, 2);
        graphics.fillCircle(6, -10, 2);
        
        // 嘴巴
        graphics.lineStyle(2, 0x000000, 1);
        graphics.beginPath();
        graphics.arc(0, -5, 6, 0, Math.PI, false);
        graphics.strokePath();
        
        // 腿
        graphics.fillStyle(Colors.NPC_PANTS, 1);
        graphics.fillRect(-12, 40, 10, 25);
        graphics.fillRect(2, 40, 10, 25);
        
        npc.add(graphics);
        
        // 名字标签
        const nameText = this.scene.add.text(0, 75, name, {
            fontSize: '18px',
            fontFamily: 'Arial',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 8, y: 4 }
        });
        nameText.setOrigin(0.5);
        npc.add(nameText);
        
        // 问号标记（如果有问题）
        if (hasQuestion) {
            const questionMark = this.scene.add.text(0, -50, '?', {
                fontSize: '32px',
                fontFamily: 'Arial Bold',
                color: '#FFD700',
                stroke: '#333333',
                strokeThickness: 3
            });
            questionMark.setOrigin(0.5);
            npc.add(questionMark);
            
            // 问号跳动动画
            this.scene.tweens.add({
                targets: questionMark,
                y: -55,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        
        // 设置交互
        const zone = this.scene.add.zone(x, y, 80, 120);
        zone.setInteractive();
        npc.zone = zone;
        
        // 存储数据
        npc.npcData = {
            name: name,
            hasQuestion: hasQuestion
        };
        
        this.npcs.push(npc);
        return npc;
    }

    removeQuestionMark(npc) {
        const questionMark = npc.list.find(child => child.text === '?');
        if (questionMark) {
            this.scene.tweens.killTweensOf(questionMark);
            questionMark.destroy();
        }
        npc.npcData.hasQuestion = false;
    }

    clearAll() {
        this.npcs.forEach(npc => {
            if (npc.zone) npc.zone.destroy();
            npc.destroy();
        });
        this.npcs = [];
    }
}