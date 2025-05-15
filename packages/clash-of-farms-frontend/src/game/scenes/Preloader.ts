import { Scene } from "phaser";
import {
    fetchPlayerStats,
    fetchPlayerPlants,
} from "@/services/api/FetchResources";
import { Plant } from "shared/src/types/types";
export class Preloader extends Scene {
    constructor() {
        super("Preloader");
    }

    init() {
        // Get the center coordinates of the game canvas
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        // Set dimensions for the loading bar
        const barWidth = 468;
        const barHeight = 32;
        const barInnerPadding = 4;

        this.add
            .rectangle(centerX, centerY, barWidth, barHeight)
            .setStrokeStyle(1, 0xffffff);

        const bar = this.add.rectangle(
            centerX - barWidth / 2 + barInnerPadding, // Start position (left edge + padding)
            centerY,
            barInnerPadding, // Initial width
            barHeight - barInnerPadding * 2, // Height with padding
            0xffffff
        );

        // Set the origin to left-center for easier width calculations
        bar.setOrigin(0, 0.5);

        // Update the progress bar based on loading progress
        this.load.on("progress", (progress: number) => {
            // Update the bar width based on the progress (scaling to fit inside the outline with padding)
            const maxBarWidth = barWidth - barInnerPadding * 2;
            bar.width = maxBarWidth * progress;
        });
    }

    preload() {
        this.load.setPath("assets");
        this.load.image("backgroundImage", "background.png");
        this.load.audio("backgroundMusic", "/audio/springtime-symphony.mp3");
        this.load.image("ground", "grass.png");
        this.load.image("barn", "Barn.png");
        this.load.image("goldCoin", "gold_coin.png");
        this.load.image("trophy", "golden-trophy-medium.png");
        this.load.image("fight", "fight.png");
        this.load.image("shop", "shop.png");
        this.load.image("corn", "corn.png");
        this.load.image("gold-storage", "gold-storage.png");
        this.load.image("Chicken", "Chicken.png");
        this.load.image("menu", "menu.png");
    }

    create() {
        const loadMainScene = async () => {
            const userStats = await fetchPlayerStats();
            const plants: Plant[] = await fetchPlayerPlants();
            const userData = { userStats, plants };

            // console.log(userData);
            this.scene.start("MainMenu", { userData });
            // this.scene.start("MainMenu");
        };
        loadMainScene();
    }
}

