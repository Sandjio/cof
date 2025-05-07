import { Scene, GameObjects } from "phaser";
import { EventBus } from "../EventBus";
import { channel } from "diagnostics_channel";

export class MainMenu extends Scene {
    private background: GameObjects.Image;
    // private backgroundMusic: Phaser.Sound.BaseSound;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.background = this.add.image(0, 0, "backgroundImage").setOrigin(0);
        this.scaleBackground();

        // const music = this.sound.add("backgroundMusic", {
        //     loop: true,
        //     volume: 0.5,
        // });
        // music.play();

        const loginUrl = `${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}/login?client_id=${process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${process.env.NEXT_PUBLIC_REDIRECT_URI}`;

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        const loginText = this.add
            .text(centerX, centerY, "Login to Play", {
                fontSize: "32px",
                color: "#ffffff",
                backgroundColor: "#000000aa",
                padding: { x: 12, y: 6 },
            })
            .setOrigin(0.5)
            .setInteractive();

        loginText.on("pointerdown", () => {
            // if (!this.backgroundMusic || !this.backgroundMusic.isPlaying) {
            //     this.backgroundMusic = this.sound.add("backgroundMusic", {
            //         loop: true,
            //         volume: 0.5,
            //     });
            //     this.backgroundMusic.play();
            // }
            window.location.href = loginUrl;
        });

        this.scale.on("resize", this.resize, this);

        EventBus.emit("current-scene-ready", this);
    }

    private scaleBackground() {
        const { width, height } = this.scale.gameSize;
        this.background.setDisplaySize(width, height);
    }

    private resize(gameSize: Phaser.Structs.Size) {
        const { width, height } = gameSize;
        this.cameras.resize(width, height);
        this.background.setDisplaySize(width, height);
    }
}

