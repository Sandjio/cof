import { GameObjects, Scene } from "phaser";
import { EventBus } from "../EventBus";
import {
    createPlant,
    createDefense,
    createAttack,
} from "@/services/api/CreateResources";

interface ShopItem {
    key: string; // unique identifier
    label: string; // displayed name
    cost: number; // gold cost
}

interface ShopCategory {
    name: string;
    items: ShopItem[];
}

export class Shop extends Scene {
    private categories: ShopCategory[];
    private gold: number;
    constructor() {
        super("Shop");
        this.categories = [
            {
                name: "Crops",
                items: [
                    { key: "corn", label: "Corn", cost: 50 },
                    { key: "wheat", label: "Wheat", cost: 30 },
                    { key: "tomato", label: "Tomato", cost: 70 },
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

    // private async publishPurchaseEvent(itemKey: string, cost: number) {
    //     const client = await getMomentoClient();
    //     const instance = AuthService.getInstance();
    //     const user = instance.getUserFromIdToken();
    //     const payload = {
    //         userId: user.userId,
    //         itemKey,
    //         cost,
    //         timestamp: new Date().toISOString(),
    //     };
    //     const rs = await client.publish(
    //         "clash-of-farms-cache",
    //         "clash-of-farms-topic",
    //         JSON.stringify(payload)
    //     );
    //     console.log(`Here is the ${rs}`);
    // }

    private async attemptPurchase(item: ShopItem, category: ShopCategory) {
        if (this.gold >= item.cost) {
            this.gold -= item.cost;
            // TODO: add item to inventory
            try {
                switch (category.name) {
                    case "Crops":
                        await createPlant(item.key, item.label, item.cost);
                        break;
                    case "Defenses":
                        await createDefense(item.key, item.label, item.cost);
                        break;
                    case "Attacks":
                        await createAttack(item.key, item.label, item.cost);
                        break;
                    default:
                        console.warn(`Unknown category: ${category.name}`);
                }
            } catch (e) {
                console.error("🚨 Failed to send purchase event:", e);
            }
            // EventBus.emit("item-purchased", item.key);
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

