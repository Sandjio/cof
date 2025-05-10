import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { AUTO, Game, Scale } from "phaser";
import { Preloader } from "./scenes/Preloader";
import { MainMenu } from "./scenes/MainMenu";
import { Shop } from "./scenes/Shop";

declare global {
    interface Window {
        game?: Phaser.Game;
    }
}

export const StartGame = (parent: string) => {
    // Destroy any existing game instance
    if (window.game) {
        window.game.destroy(true);
    }
    const config: Phaser.Types.Core.GameConfig = {
        type: AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: "game-container",
        backgroundColor: "#028af8",
        scene: [Boot, Preloader, MainMenu, MainGame, Shop],
        scale: {
            mode: Scale.RESIZE,
            autoCenter: Scale.CENTER_BOTH,
        },
        physics: {
            default: "arcade",
            arcade: {
                debug: false,
            },
        },
    };
    window.game = new Game({ ...config, parent });
    return window.game;
};

