// scenes/BootScene.js
// 启动预加载场景 - 转换为 ES Modules

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // 绘制进度条
        let progressBar = this.add.graphics();
        let progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(720 / 2 - 160, 1280 / 2 - 25, 320, 50);

        let width = 720;
        let height = 1280;
        let loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: '凝聚符文...',
            style: { font: '20px monospace', fill: '#ffffff' }
        });
        loadingText.setOrigin(0.5, 0.5);

        this.load.on('progress', function (value) {
            progressBar.clear();
            progressBar.fillStyle(0xffd700, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        this.load.on('complete', function () {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        // 这里可以加载图片、音效等资源
        // this.load.image('player', 'assets/player.png');
    }

    create() {
        this.scene.start('MenuScene');
    }
}

export default BootScene;