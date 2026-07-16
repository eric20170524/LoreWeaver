// js/main.js
// Phaser 核心：场景注册、全局 game 实例 - 转换为 ES Modules

import BootScene from '../scenes/BootScene.js';
import MenuScene from '../scenes/MenuScene.js';
import MainScene from '../scenes/MainScene.js';
import LevelUpScene from '../scenes/LevelUpScene.js';
import PerkTreeScene from '../scenes/PerkTreeScene.js';
import AbilityCodexScene from '../scenes/AbilityCodexScene.js';
import GameOverScene from '../scenes/GameOverScene.js';

import Node1Scene from '../nodes/node1.js';
import Node2Scene from '../nodes/node2.js';
import Node3Scene from '../nodes/node3.js';
import Node4Scene from '../nodes/node4.js';
import Node5Scene from '../nodes/node5.js';
import Node6Scene from '../nodes/node6.js';
import Node7Scene from '../nodes/node7.js';
import Node8Scene from '../nodes/node8.js';
import Node9Scene from '../nodes/node9.js';
import Node10Scene from '../nodes/node10.js';
import Node11Scene from '../nodes/node11.js';
import Node12Scene from '../nodes/node12.js';

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#1a1a1a',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    dom: {
        createContainer: true
    },
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'game-container',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 720,
        height: 1280
    },
    scene: [
        BootScene,
        MenuScene,
        MainScene,
        LevelUpScene,
        PerkTreeScene,
        AbilityCodexScene,
        Node1Scene,
        Node2Scene,
        Node3Scene,
        Node4Scene,
        Node5Scene,
        Node6Scene,
        Node7Scene,
        Node8Scene,
        Node9Scene,
        Node10Scene,
        Node11Scene,
        Node12Scene,
        GameOverScene
    ]
};

// 启动游戏实例
window.game = new Phaser.Game(config);
export default window.game;
