import { Scene, GameObjects } from "phaser";
import { EventBus } from "../EventBus";
import { AuthService } from "@/services/AuthService";

export class MainMenu extends Scene {
    private background: GameObjects.Image;
    private logoutButton: GameObjects.Text;
    private authService: AuthService;
    // private backgroundMusic: Phaser.Sound.BaseSound;

    constructor() {
        super("MainMenu");
        this.authService = AuthService.getInstance();
    }

    create() {
        this.background = this.add.image(0, 0, "backgroundImage").setOrigin(0);
        this.scaleBackground();

        // const music = this.sound.add("backgroundMusic", {
        //     loop: true,
        //     volume: 0.5,
        // });
        // music.play();

        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // Logout button
        this.logoutButton = this.add
            .text(centerX, centerY + 50, "Logout", {
                fontSize: "24px",
                color: "#ffffff",
                backgroundColor: "#000000aa",
                padding: { x: 12, y: 6 },
            })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.logoutButton.on("pointerdown", () => {
            this.authService.logout();
            // Use window.location to redirect to home page
            window.location.href = "/";
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

