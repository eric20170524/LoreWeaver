import { GameSpec, PlayerState } from "../../types";

export interface UIPluginContext {
  onLog: (text: string) => void;
  saveStateToStore: () => void;
}

export interface UIPlugin {
  renderTopHUD(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext): void;
  renderClickCore(scene: Phaser.Scene, state: PlayerState, spec: GameSpec, context: UIPluginContext): void;
  update(time: number, delta: number): void;
  destroy(): void;
}

