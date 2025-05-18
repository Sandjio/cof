import { GameObjects, Scene } from "phaser";
import { EventBus } from "../EventBus";
import {
    createPlant,
    createDefense,
    createAttack,
} from "@/services/api/CreateResources";

export interface ShopItem {
    key: string; // unique identifier
    label: string; // displayed name
    cost: number; // gold cost
    instanceId?: string;
    placedAt?: string;
}

export interface ShopCategory {
    name: string;
    items: ShopItem[];
}

export class Shop extends Scene {
    private categories: ShopCategory[];
    private gold: number;
    // private purchasedItems: ShopItem[] = [];

    constructor() {
        super("Shop");
        this.categories = [
            {
                name: "Crops/Animals",
                items: [
                    { key: "Corn", label: "Corn", cost: 50 },
                    { key: "Wheat", label: "Wheat", cost: 30 },
                    { key: "Tomato", label: "Tomato", cost: 70 },
                    { key: "Chicken", label: "Chicken", cost: 200 },
                ],
            },
            {
                name: "Defenses",
                items: [
                    { key: "scarecrow", label: "Scarecrow", cost: 100 },
                    { key: "fence", label: "Fence", cost: 150 },
                ],
            },
            {
                name: "Attacks",
                items: [
                    { key: "bird", label: "Angry Bird", cost: 120 },
                    { key: "bug", label: "Spiky Bug", cost: 90 },
                ],
            },
        ];
    }

    init(data: any) {
        this.gold = data.gold;
    }

    create() {
        const { width } = this.scale;
        const startX = 100;
        const startY = 100;
        const colWidth = (width - startX * 2) / this.categories.length;
        const rowHeight = 40;

        // Display current gold
        this.add
            .text(width - 20, 20, `Gold: ${this.gold}`, {
                fontSize: "18px",
                color: "#ffff00",
            })
            .setOrigin(1, 0)
            .setName("goldText");

        this.add
            .text(20, 10, "Close", {
                fontSize: "18px",
                color: "#ffff00",
            })
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                this.scene.start("Game");
            });

        // Create table headers
        this.categories.forEach((cat, colIndex) => {
            const x = startX + colIndex * colWidth;
            this.add
                .text(x, startY, cat.name, {
                    fontSize: "20px",
                    color: "#ffffff",
                    fontStyle: "bold",
                })
                .setOrigin(0, 0);

            // Create items under each category
            cat.items.forEach((item, rowIndex) => {
                const y = startY + (rowIndex + 1) * rowHeight;

                // Item label
                this.add
                    .text(x, y, `${item.label} (${item.cost}💰)`, {
                        fontSize: "16px",
                        color: "#ffffff",
                    })
                    .setOrigin(0, 0.5);

                // Purchase button
                // const btn = this.add
                //     .image(x + colWidth - 60, y, "button")
                //     .setInteractive({ useHandCursor: true })
                //     .setOrigin(0.5)
                //     .setDisplaySize(80, 30);

                const btnText = this.add
                    .text(x + colWidth - 60, y, "Buy", {
                        fontSize: "14px",
                        color: "#000000",
                    })
                    .setOrigin(0.5)
                    .setInteractive({ useHandCursor: true });

                btnText.on("pointerdown", () =>
                    this.attemptPurchase(item, cat)
                );
            });
        });

        EventBus.emit("current-scene-ready", this);
    }

    showSuccessMessage(message: string) {
        const text = this.add
            .text(this.cameras.main.centerX, 50, message, {
                fontSize: "20px",
                color: "#00ff00",
                fontStyle: "bold",
                backgroundColor: "#000000aa",
                padding: { x: 10, y: 5 },
            })
            .setOrigin(0.5)
            .setDepth(1000);

        // Auto-destroy after 2 seconds with fade-out
        this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 1000,
            delay: 1000,
            onComplete: () => text.destroy(),
        });
    }

    private async attemptPurchase(item: ShopItem, category: ShopCategory) {
        if (this.gold >= item.cost) {
            this.gold -= item.cost;
            try {
                let purchasedItem: ShopItem = { ...item }; // Clone the item
                switch (category.name) {
                    case "Crops/Animals":
                        const response = await createPlant(
                            item.key,
                            item.label,
                            item.cost
                        );
                        // console.log("🌾 Plant created:", response.plant);
                        purchasedItem.instanceId = response.plant.instanceId;
                        this.showSuccessMessage(
                            `✅ Crop created: ${item.label}`
                        );
                        break;
                    case "Defenses":
                        await createDefense(item.key, item.label, item.cost);
                        this.showSuccessMessage(
                            `🛡️ Defense created: ${item.label}`
                        );
                        break;
                    case "Attacks":
                        await createAttack(item.key, item.label, item.cost);
                        this.showSuccessMessage(
                            `⚔️ Attack created: ${item.label}`
                        );
                        break;
                    default:
                        console.warn(`Unknown category: ${category.name}`);
                }
                EventBus.emit("shop-purchased", item, category);
            } catch (e) {
                console.error("🚨 Failed to send purchase event:", e);
            }
            // console.log("Item purchased:", item.key);
            this.refreshGoldDisplay();
        } else {
            // Insufficient funds feedback
            console.log("Not enough gold!");
            const { width } = this.scale;
            const msg = this.add
                .text(width / 2, 50, "Not enough gold!", {
                    fontSize: "18px",
                    color: "#ff0000",
                })
                .setOrigin(0.5);

            this.time.delayedCall(1000, () => msg.destroy());
        }
    }

    private refreshGoldDisplay() {
        const goldText = this.children.getByName(
            "goldText"
        ) as Phaser.GameObjects.Text;
        if (goldText) {
            goldText.setText(`Gold: ${this.gold}`);
        }
    }
}

