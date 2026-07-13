// utils/UIHelper.js
// UI 助手 - 转换为 ES Modules 并引入 @core/ui/ 组件

import ButtonBuilder from '@core/ui/ButtonBuilder.js';
import ModalManager from '@core/ui/ModalManager.js';
import AudioManager from './AudioManager.js';

export class UIHelper {
    /**
     * 在指定位置显示向上飘浮并渐隐的文字
     */
    static showFloatText(scene, x, y, text, color = '#ffffff', duration = 1500) {
        const floatText = scene.add.text(x, y, text, {
            fontSize: '24px',
            fill: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(1000);

        scene.tweens.add({
            targets: floatText,
            y: y - 50,
            alpha: 0,
            duration: duration,
            ease: 'Power2',
            onComplete: () => {
                floatText.destroy();
            }
        });
    }

    /**
     * 为按钮添加点击动效与音效
     */
    static bindButtonBounce(button, onClickCallback) {
        button.on('pointerdown', () => {
            AudioManager.playClick();
            
            button.scene.tweens.add({
                targets: button,
                scaleX: 0.9,
                scaleY: 0.9,
                duration: 50,
                yoyo: true,
                onComplete: () => {
                    if (onClickCallback) onClickCallback();
                }
            });
        });
    }

    /**
     * 显示一个通用的确认弹窗（完美适配原有设计，具备确定和取消按钮）
     */
    static showConfirmModal(scene, title, message, onConfirm, onCancel = null) {
        const width = scene.cameras.main.width || 720;
        const height = scene.cameras.main.height || 1280;

        // 蒙版背景
        const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setDepth(2000).setInteractive();
        
        // 弹窗主体
        const modalBg = scene.add.rectangle(width / 2, height / 2, 500, 300, 0x1a1a1a, 0.95).setDepth(2001);
        modalBg.setStrokeStyle(3, 0x8b0000);

        // 标题
        const titleText = scene.add.text(width / 2, height / 2 - 100, title, {
            fontSize: '28px',
            fill: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(2002);

        // 内容文本
        const contentText = scene.add.text(width / 2, height / 2 - 20, message, {
            fontSize: '20px',
            fill: '#ffffff',
            align: 'center',
            wordWrap: { width: 440, useAdvancedWrap: true }
        }).setOrigin(0.5).setDepth(2002);

        // 确认按钮
        const confirmBtn = scene.add.text(width / 2 - 100, height / 2 + 80, '确认', {
            fontSize: '24px',
            fill: '#ffffff',
            backgroundColor: '#8b0000',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive().setDepth(2002);

        // 取消按钮
        const cancelBtn = scene.add.text(width / 2 + 100, height / 2 + 80, '取消', {
            fontSize: '24px',
            fill: '#ffffff',
            backgroundColor: '#555555',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive().setDepth(2002);

        const cleanup = () => {
            overlay.destroy();
            modalBg.destroy();
            titleText.destroy();
            contentText.destroy();
            confirmBtn.destroy();
            cancelBtn.destroy();
        };

        this.bindButtonBounce(confirmBtn, () => {
            cleanup();
            if (onConfirm) onConfirm();
        });

        this.bindButtonBounce(cancelBtn, () => {
            cleanup();
            if (onCancel) onCancel();
        });
    }
}

export default UIHelper;
window.UIHelper = UIHelper; // Bind to window for global access if needed
