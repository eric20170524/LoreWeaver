class ModalManager {
    /**
     * 生成一个标准化的弹窗 (自带半透明遮罩与防点击穿透)
     * 遵循 7_RULES_AND_BUGS.md: 使用大面积的 Interactive Rect 阻挡底部点击
     * 
     * @param {Phaser.Scene} scene 
     * @param {string} title 
     * @param {string} content 
     * @param {function} onClose 
     */
    static show(scene, title, content, onClose = null) {
        const { width, height } = scene.scale;
        
        // 弹窗主容器，放在极高的层级
        const modalContainer = scene.add.container(width / 2, height / 2);
        modalContainer.setDepth(1000);

        // 1. 拦截层 (Mask)：全屏半透明黑底，防穿透
        const mask = scene.add.graphics();
        mask.fillStyle(0x000000, 0.7);
        mask.fillRect(-width / 2, -height / 2, width, height);
        
        // 关键红线：让 Mask 吞噬所有点击事件
        mask.setInteractive(new Phaser.Geom.Rectangle(-width/2, -height/2, width, height), Phaser.Geom.Rectangle.Contains);
        modalContainer.add(mask);

        // 2. 弹窗底板
        const panelWidth = Math.min(width * 0.8, 500);
        const panelHeight = Math.min(height * 0.5, 400);
        const panel = scene.add.graphics();
        panel.fillStyle(0x222233, 1);
        panel.lineStyle(4, 0x4CAF50);
        panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 20);
        panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 20);
        modalContainer.add(panel);

        // 3. 标题与正文
        const titleText = scene.add.text(0, -panelHeight / 2 + 50, title, {
            fontSize: '40px',
            fontFamily: 'Arial Black',
            color: '#4CAF50'
        }).setOrigin(0.5);
        modalContainer.add(titleText);

        const contentText = scene.add.text(0, -20, content, {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: panelWidth - 40, useAdvancedWrap: true }
        }).setOrigin(0.5);
        modalContainer.add(contentText);

        // 4. 关闭按钮 (基于区域判定)
        const btnWidth = 160;
        const btnHeight = 60;
        const btnY = panelHeight / 2 - 60;
        
        const btnBg = scene.add.graphics();
        btnBg.fillStyle(0xe53935, 1);
        btnBg.fillRoundedRect(-btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 10);
        modalContainer.add(btnBg);

        const btnText = scene.add.text(0, btnY, '确定', {
            fontSize: '28px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);
        modalContainer.add(btnText);

        // 设定确切的交互区域 (因为加在 Container 里，使用Zone比较方便或者在面板上创建不可见Sprite)
        const closeZone = scene.add.zone(0, btnY, btnWidth, btnHeight);
        closeZone.setInteractive({ useHandCursor: true });
        modalContainer.add(closeZone);

        // 关闭逻辑与动画
        const closeModal = () => {
            scene.tweens.add({
                targets: modalContainer,
                scale: 0.8,
                alpha: 0,
                duration: 150,
                ease: 'Power2',
                onComplete: () => {
                    modalContainer.destroy();
                    if (onClose) onClose();
                }
            });
        };

        closeZone.on('pointerdown', () => {
            // 这里可以调用 WebAudioSynth.playClick(); 如果需要引入的话
            btnBg.setAlpha(0.7);
        });
        closeZone.on('pointerup', () => {
            closeModal();
        });
        closeZone.on('pointerout', () => {
            btnBg.setAlpha(1);
        });

        // 5. 进场动画 (Juice)
        modalContainer.setScale(0.5);
        modalContainer.setAlpha(0);
        scene.tweens.add({
            targets: modalContainer,
            scale: 1,
            alpha: 1,
            duration: 300,
            ease: 'Back.easeOut'
        });

        // 暴露按钮文本对象供外部动态修改
        modalContainer.confirmBtn = btnText;
        modalContainer.closeBtn = closeZone;

        return modalContainer;
    }
}

export default ModalManager;
