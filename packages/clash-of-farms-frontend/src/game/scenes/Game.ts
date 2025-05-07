import { GameObjects, Scene } from "phaser";

import { EventBus } from "../EventBus";

export class Game extends Scene {
    constructor() {
        super("Game");
    }
    create() {
        // display welcome message
        this.add.text(400, 300, "Welcome to Phaser + React", {
            fontSize: "32px",
            color: "#fff",
        });
        EventBus.emit("current-scene-ready", this);
    }
}

