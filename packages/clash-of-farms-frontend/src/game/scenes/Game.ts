import { GameObjects, Scene, Math as PhaserMath } from "phaser";
import { EventBus } from "../EventBus";
import { ShopItem, ShopCategory } from "./Shop";
import { getMomentoClient } from "@/utils/momento";
import { AuthService } from "@/services/AuthService";
import { PlantSeededEvent } from "shared/src/events/plantEvent";
import { Plant, UserStats } from "shared/src/types/types";
import { PlantHarvestedEvent } from "shared/src/events/plantEvent";

interface PlaceableConfig {
    key: string;
    x: number;
    y: number;
    scale?: number;
    id?: string;
}

export class Game extends Scene {
    private initData: { userStats: UserStats; plants: Plant[] };
    // Camera control properties
    private isDragging: boolean = false;
    private lastPointerPosition: { x: number; y: number } | null = null;
    private worldSize = {
        width: window.innerWidth * 3, // Make world significantly larger than screen
        height: window.innerHeight * 3,
    };
    private mainCamera?: Phaser.Cameras.Scene2D.Camera;

    // Game UI Elements
    private goldCoin?: GameObjects.Sprite;
    private goldText?: GameObjects.Text;
    private trophy?: GameObjects.Image;
    private trophyText?: GameObjects.Text;
    private fight?: GameObjects.Image;
    private shop?: GameObjects.Image;
    private experienceText: GameObjects.Text;
    private menu?: GameObjects.Image;
    private selectedPlantText: GameObjects.Text | undefined;

    private uiCamera?: Phaser.Cameras.Scene2D.Camera;
    private worldContainer: Phaser.GameObjects.Container;
    // private debugText?: GameObjects.Text;
    private isDraggingSprite = false;
    private placeableConfigs: PlaceableConfig[] = [
        {
            key: "barn",
            x: this.worldSize.width / 2,
            y: this.worldSize.height / 2,
            scale: 0.1,
        },
        {
            key: "gold-storage",
            x: this.worldSize.width / 2 - 500,
            y: this.worldSize.height / 2 - 500,
            scale: 0.1,
        },
    ];

    constructor() {
        super("Game");
    }

    init(data: any) {
        this.initData = data;
        // Process user plants data
        this.processUserPlants();
    }

    // Process the plants data and add to placeableConfigs
    private processUserPlants(): void {
        if (
            !this.initData ||
            !this.initData.plants ||
            !Array.isArray(this.initData.plants)
        ) {
            console.error("No plants data available");
            return;
        }

        // Process each plant in the plants array
        this.initData.plants.forEach((plant: Plant) => {
            if (!plant.coordinates || !Array.isArray(plant.coordinates)) {
                console.error("Invalid plant data structure", plant);
                return;
            }

            // Add each coordinate of this plant type to placeableConfigs
            plant.coordinates.forEach((coord: any) => {
                // Accept both string and number for compatibility
                const x =
                    typeof coord.xCoordinate === "number"
                        ? coord.xCoordinate
                        : parseInt(coord.xCoordinate);
                const y =
                    typeof coord.yCoordinate === "number"
                        ? coord.yCoordinate
                        : parseInt(coord.yCoordinate);

                if (isNaN(x) || isNaN(y)) {
                    console.error("Invalid coordinates for plant", coord);
                    return;
                }

                this.placeableConfigs.push({
                    key: plant.name, // Use plant name as the sprite key
                    x: x,
                    y: y,
                    scale: 0.1,
                    id: coord.id,
                });
            });
        });
    }

    create() {
        EventBus.on(
            "shop-purchased",
            (item: ShopItem, category: ShopCategory) => {
                if (category.name === "Crops/Animals") {
                    if (!this.mainCamera) {
                        console.error("Main camera is not initialized.");
                        return;
                    }
                    const cameraView = this.mainCamera.worldView;
                    const padding = 100;
                    const x = PhaserMath.Between(
                        cameraView.x + padding,
                        cameraView.x + cameraView.width - padding
                    );
                    const y = PhaserMath.Between(
                        cameraView.y + padding,
                        cameraView.y + cameraView.height - padding
                    );
                    this.placeableConfigs.push({
                        key: item.key,
                        x,
                        y,
                        scale: 0.1,
                    });
                    this.createPlaceable({ key: item.key, x, y, scale: 0.1 });
                    this.publishPlantSeedEvent(
                        item.instanceId!,
                        item.key,
                        x.toString(),
                        y.toString()
                    );
                }
            }
        );

        // Initialize the world container first
        this.worldContainer = this.add.container(0, 0);

        // Set up the world
        this.createWorld();

        // Set up the main camera with boundaries
        this.setupMainCamera();

        // create all configured placeables
        this.placeableConfigs.forEach((cfg) => this.createPlaceable(cfg));

        this.setupUICamera();

        // Set up camera controls
        this.setupCameraControls();

        // Add debug text for zoom level
        // this.debugText = this.add.text(10, 10, "Zoom: 1.0", {
        //     fontFamily: "Arial",
        //     fontSize: "18px",
        //     color: "#FFFFFF",
        //     backgroundColor: "#000000",
        // });
        // this.debugText.setScrollFactor(0);
        // this.debugText.setDepth(1000);

        // Add a grid to make zoom more noticeable
        this.createVisualGrid();

        // Notify that the scene is ready
        EventBus.emit("current-scene-ready", this);
    }

    createVisualGrid() {
        // Create a grid pattern across the world to make zoom more visually noticeable
        const gridSize = 100;
        const graphics = this.add.graphics();

        // Set line style
        graphics.lineStyle(2, 0x00ff00, 0.3);

        // Draw vertical lines
        for (let x = 0; x <= this.worldSize.width; x += gridSize) {
            graphics.moveTo(x, 0);
            graphics.lineTo(x, this.worldSize.height);
        }

        // Draw horizontal lines
        for (let y = 0; y <= this.worldSize.height; y += gridSize) {
            graphics.moveTo(0, y);
            graphics.lineTo(this.worldSize.width, y);
        }

        // Add to world container
        graphics.setDepth(10);
        this.worldContainer.add(graphics);
    }

    setupUICamera() {
        const stats = this.initData.userStats;
        const { Gold, Trophy, Experience } = stats;

        // Create a separate camera for UI elements
        this.uiCamera = this.cameras.add(
            0,
            0,
            this.scale.width,
            this.scale.height
        );
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.setZoom(1); // Always at 1x zoom
        this.uiCamera.setName("UICamera");

        // Add gold coin to the top right
        this.goldCoin = this.add
            .sprite(
                this.scale.width - 50, // Position from right
                50, // Position from top
                "goldCoin"
            )
            .setScale(0.1);

        // Add a text to show gold count
        this.goldText = this.add
            .text(this.scale.width - 90, 50, `${Gold}`, {
                fontFamily: "Arial",
                fontSize: "24px",
                color: "#FFD700",
            })
            .setOrigin(1, 0.5);

        // Add trophy image to the top left of the scene
        this.trophy = this.add.image(50, 50, "trophy").setScale(0.2);
        this.trophyText = this.add
            .text(80, 50, `${Trophy}`, {
                fontFamily: "Arial",
                fontSize: "24px",
                color: "#FFD700",
            })
            .setOrigin(0, 0.5);

        this.experienceText = this.add.text(40, 100, `XP: ${Experience}`, {
            fontFamily: "Arial",
            fontSize: "24px",
            color: "#FFD700",
        });
        // Add Battle image at the bottom left of the scene
        this.fight = this.add
            .image(60, this.scale.height - 100, "fight")
            .setScale(0.1);
        // Add the Menu Icon
        this.menu = this.add
            .image(60, this.scale.height - 200, "menu")
            .setScale(0.1)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                this.scene.start("MainMenu");
            });

        // Add the shop icon at the bottom right of the scene
        this.shop = this.add
            .image(this.scale.width - 60, this.scale.height - 100, "shop")
            .setScale(0.1)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                this.scene.start("Shop", { gold: Gold });
            });

        if (
            this.goldCoin &&
            this.goldText &&
            this.trophy &&
            this.trophyText &&
            this.fight &&
            this.shop &&
            this.experienceText &&
            this.menu
        ) {
            // Don't move with camera
            this.goldCoin.setScrollFactor(0);
            this.goldText.setScrollFactor(0);
            this.trophy.setScrollFactor(0);
            this.trophyText.setScrollFactor(0);
            this.fight.setScrollFactor(0);
            this.shop.setScrollFactor(0);
            this.experienceText.setScrollFactor(0);
            this.menu.setScrollFactor(0);

            // Remove UI elements from the main camera
            this.cameras.main.ignore([
                this.goldCoin,
                this.goldText,
                this.trophy,
                this.trophyText,
                this.fight,
                this.shop,
                this.experienceText,
                this.menu,
            ]);

            // Ensure UI camera only sees UI elements
            this.uiCamera.ignore(this.worldContainer);
        }

        // Handle window resize to reposition UI elements
        this.scale.on("resize", this.resizeUI, this);
    }

    resizeUI(gameSize: any) {
        if (
            this.goldCoin &&
            this.goldText &&
            this.trophy &&
            this.trophyText &&
            this.uiCamera &&
            this.fight &&
            this.shop &&
            this.experienceText &&
            this.menu
        ) {
            // Resize UI camera viewport
            this.uiCamera.setSize(gameSize.width, gameSize.height);

            // Reposition gold coin
            this.goldCoin.setPosition(gameSize.width - 50, 50);

            // Reposition gold text
            this.goldText.setPosition(gameSize.width - 90, 50);

            this.trophy.setPosition(50, 50);

            this.trophyText.setPosition(80, 50);

            this.fight.setPosition(60, gameSize.height - 100);

            this.shop.setPosition(gameSize.width - 60, gameSize.height - 100);

            this.experienceText.setPosition(
                gameSize.width - 40,
                gameSize.height - 100
            );

            this.menu.setPosition(gameSize.width - 60, gameSize.height - 200);

            // Reposition debug text if it exists
            // if (this.debugText) {
            //     this.debugText.setPosition(10, 10);
            // }
        }
    }

    createWorld() {
        // Create a large world for the player to navigate
        const tileWidth = 256;
        const tileHeight = 128;
        const effectiveHeight = tileHeight / 2;

        const tilesWidth =
            Math.ceil(this.worldSize.width / (tileWidth / 2)) + 4; // Add padding
        const tilesHeight =
            Math.ceil(this.worldSize.height / effectiveHeight) + 4; // Add padding

        // Extend the world size to ensure full coverage
        this.worldSize.width = tilesWidth * (tileWidth / 2);
        this.worldSize.height = tilesHeight * effectiveHeight;

        console.log(
            "World size:",
            this.worldSize.width,
            "x",
            this.worldSize.height
        );

        const ground = this.add
            .tileSprite(
                0,
                0,
                this.worldSize.width,
                this.worldSize.height,
                "ground"
            )
            .setOrigin(0)
            .setDepth(0);

        this.worldContainer.add(ground);

        // Define world bounds for physics and camera
        this.physics.world.setBounds(
            0,
            0,
            this.worldSize.width,
            this.worldSize.height
        );

        // Add corner markers to help visualize the world bounds
        this.addWorldCornerMarkers();
    }

    addWorldCornerMarkers() {
        // Add visual markers at the corners of the world
        const corners = [
            { x: 0, y: 0, label: "TOP-LEFT" },
            { x: this.worldSize.width, y: 0, label: "TOP-RIGHT" },
            { x: 0, y: this.worldSize.height, label: "BOTTOM-LEFT" },
            {
                x: this.worldSize.width,
                y: this.worldSize.height,
                label: "BOTTOM-RIGHT",
            },
        ];

        corners.forEach((corner) => {
            // Create a circle marker
            const marker = this.add.circle(
                corner.x,
                corner.y,
                50,
                0xff00ff,
                0.7
            );

            // Add label
            const text = this.add
                .text(corner.x, corner.y, corner.label, {
                    fontFamily: "Arial",
                    fontSize: "20px",
                    color: "#ffffff",
                    stroke: "#000000",
                    strokeThickness: 4,
                })
                .setOrigin(0.5);

            this.worldContainer.add([marker, text]);
        });
    }

    setupMainCamera() {
        // Get reference to main camera
        this.mainCamera = this.cameras.main;

        // Configure camera to follow the world container
        this.mainCamera.startFollow(this.worldContainer, false, 1, 1, 0, 0);
        this.mainCamera.stopFollow(); // Stop following but keep the configuration

        this.mainCamera.ignore([]); // Clear any previous ignores

        // Set bounds so camera won't go outside the game world
        this.mainCamera.setBounds(
            0,
            0,
            this.worldSize.width,
            this.worldSize.height
        );

        // Start the camera in the middle of the world
        this.mainCamera.centerOn(
            this.worldSize.width / 2,
            this.worldSize.height / 2
        );

        // Set initial zoom with more dramatic value to test
        const initialZoom = 1.0;
        this.mainCamera.setZoom(initialZoom);

        // Use a stronger zoom effect for testing
        this.mainCamera.zoomTo(1.5, 1000); // Zoom to 1.5x over 1 second
        setTimeout(() => {
            if (this.mainCamera) {
                this.mainCamera.zoomTo(1.0, 1000); // Then back to 1.0x
            }
        }, 1500);

        // Add some lerping for smooth camera movement
        this.mainCamera.setLerp(0.1);

        // Debug log to check camera settings
        console.log("Camera setup - Initial zoom:", this.mainCamera.zoom);
        console.log("Camera bounds:", this.mainCamera.getBounds());
    }

    setupCameraControls() {
        // Setup pointer down for dragging
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            // Only start dragging if this is the main pointer (left click or first touch)
            if (pointer.button === 0 || pointer.identifier === 0) {
                this.isDragging = true;
                this.lastPointerPosition = { x: pointer.x, y: pointer.y };
                console.log("Drag started at", pointer.x, pointer.y);
            }
        });

        // Setup pointer move for camera movement
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.isDraggingSprite) return;
            if (!this.isDragging || !this.lastPointerPosition) return;

            // Calculate the distance moved
            const deltaX = pointer.x - this.lastPointerPosition.x;
            const deltaY = pointer.y - this.lastPointerPosition.y;

            // Update camera position (invert movement to make it feel like you're grabbing the world)
            if (this.mainCamera) {
                this.mainCamera.scrollX -= deltaX / this.mainCamera.zoom;
                this.mainCamera.scrollY -= deltaY / this.mainCamera.zoom;
                // console.log(
                //     "Camera scroll:",
                //     this.mainCamera.scrollX,
                //     this.mainCamera.scrollY
                // );
            }

            // Update last position
            this.lastPointerPosition = { x: pointer.x, y: pointer.y };
        });

        // Setup pointer up to stop dragging
        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            // whenever any pointer is released, also reset sprite‑drag flag
            this.isDraggingSprite = false;
            if (pointer.button === 0 || pointer.identifier === 0) {
                this.isDragging = false;
                this.lastPointerPosition = null;
                console.log("Drag ended");
            }
        });

        // Listen for Phaser drag events (for interactive sprites)
        this.input.on(
            "dragstart",
            (
                _pointer: Phaser.Input.Pointer,
                gameObject: Phaser.GameObjects.GameObject
            ) => {
                this.isDraggingSprite = true;
                console.log("Started dragging sprite", gameObject);
            }
        );

        this.input.on(
            "drag",
            (
                _pointer: Phaser.Input.Pointer,
                gameObject: Phaser.GameObjects.GameObject & {
                    x: number;
                    y: number;
                },
                dragX: number,
                dragY: number
            ) => {
                // Move the sprite inside the world container
                gameObject.x = dragX;
                gameObject.y = dragY;
            }
        );

        this.input.on(
            "dragend",
            (
                _pointer: Phaser.Input.Pointer,
                gameObject: Phaser.GameObjects.GameObject & {
                    x: number;
                    y: number;
                    gameObjectType?: string;
                    plantId?: string;
                }
            ) => {
                console.log("Dropped sprite at", gameObject.x, gameObject.y);
                this.isDraggingSprite = false;

                // If this is a plant with an ID, update its position in the backend
                if (
                    gameObject.gameObjectType === "plant" &&
                    gameObject.plantId
                ) {
                    this.publishPlantSeedEvent(
                        gameObject.plantId,
                        (gameObject as Phaser.GameObjects.Image).texture.key,
                        gameObject.x.toString(),
                        gameObject.y.toString()
                    );
                }
            }
        );

        // Mouse wheel zoom with enhanced sensitivity
        this.input.on(
            "wheel",
            (
                pointer: any,
                gameObjects: any,
                deltaX: number,
                deltaY: number
            ) => {
                // Calculate new zoom level with enhanced sensitivity for testing
                const zoomChange = -deltaY * 0.001;

                if (this.mainCamera) {
                    let currentZoom = this.mainCamera.zoom;
                    let newZoom = currentZoom + zoomChange;

                    // Clamp zoom between min and max values
                    newZoom = Phaser.Math.Clamp(newZoom, 0.5, 2.0);

                    // Debug log
                    console.log(
                        "Zoom wheel - Current:",
                        currentZoom,
                        "New:",
                        newZoom,
                        "Change:",
                        zoomChange
                    );

                    // For enhanced visual feedback, use zoomTo instead of setZoom
                    if (Math.abs(newZoom - currentZoom) > 0.01) {
                        this.mainCamera.zoomTo(newZoom, 100); // Animate zoom over 100ms
                    }

                    // Apply center point correction
                    this.zoomCameraAt(pointer, newZoom);

                    // Update debug text
                    // if (this.debugText) {
                    //     this.debugText.setText(`Zoom: ${newZoom.toFixed(2)}`);
                    // }
                }
            }
        );

        // For mobile: pinch to zoom with enhanced sensitivity
        this.input.addPointer(1); // Ensure we can track 2 pointers for pinch

        let prevDistance = 0;
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                // We're pinching - stop normal camera dragging
                this.isDragging = false;

                // Calculate the distance between the two pointers
                const p1 = this.input.pointer1;
                const p2 = this.input.pointer2;
                const distance = Phaser.Math.Distance.Between(
                    p1.x,
                    p1.y,
                    p2.x,
                    p2.y
                );

                // If we have a previous distance, calculate zoom
                if (prevDistance > 0) {
                    const distanceChange = distance - prevDistance;
                    const zoomChange = distanceChange * 0.001;

                    if (this.mainCamera) {
                        let currentZoom = this.mainCamera.zoom;
                        let newZoom = currentZoom + zoomChange;

                        // Clamp zoom between min and max
                        newZoom = Phaser.Math.Clamp(newZoom, 0.5, 2.0);

                        // Find center point between fingers for zoom center
                        const centerX = (p1.x + p2.x) / 2;
                        const centerY = (p1.y + p2.y) / 2;
                        const centerPointer = { x: centerX, y: centerY };

                        // Debug log
                        console.log(
                            "Pinch zoom - Current:",
                            currentZoom,
                            "New:",
                            newZoom,
                            "Change:",
                            zoomChange
                        );

                        // For enhanced visual feedback, use zoomTo
                        if (Math.abs(newZoom - currentZoom) > 0.01) {
                            this.mainCamera.zoomTo(newZoom, 100);
                        }

                        // Apply center point correction
                        this.zoomCameraAt(centerPointer, newZoom);

                        // Update debug text
                        // if (this.debugText) {
                        //     this.debugText.setText(
                        //         `Zoom: ${newZoom.toFixed(2)}`
                        //     );
                        // }
                    }
                }

                prevDistance = distance;
            } else {
                prevDistance = 0;
            }
        });

        // Add keyboard controls for testing zoom
        this.input.keyboard?.on("keydown-PLUS", () => {
            if (this.mainCamera) {
                let newZoom = Phaser.Math.Clamp(
                    this.mainCamera.zoom + 0.1,
                    0.5,
                    2.0
                );
                // console.log("Keyboard zoom in:", newZoom);
                this.mainCamera.zoomTo(newZoom, 200);

                // if (this.debugText) {
                //     this.debugText.setText(`Zoom: ${newZoom.toFixed(2)}`);
                // }
            }
        });

        this.input.keyboard?.on("keydown-MINUS", () => {
            if (this.mainCamera) {
                let newZoom = Phaser.Math.Clamp(
                    this.mainCamera.zoom - 0.1,
                    0.5,
                    2.0
                );
                // console.log("Keyboard zoom out:", newZoom);
                this.mainCamera.zoomTo(newZoom, 200);

                // if (this.debugText) {
                //     this.debugText.setText(`Zoom: ${newZoom.toFixed(2)}`);
                // }
            }
        });

        // Space key to reset zoom
        this.input.keyboard?.on("keydown-SPACE", () => {
            if (this.mainCamera) {
                console.log("Reset zoom to 1.0");
                this.mainCamera.zoomTo(1.0, 300);

                // if (this.debugText) {
                //     this.debugText.setText("Zoom: 1.00");
                // }
            }
        });
    }

    zoomCameraAt(pointer: { x: number; y: number }, zoom: number) {
        // Don't zoom if no camera reference
        if (!this.mainCamera) return;

        // Get the world position before zoom change
        const worldPoint = this.mainCamera.getWorldPoint(pointer.x, pointer.y);

        // Set the new zoom level directly
        this.mainCamera.setZoom(zoom);

        // Log the actual zoom after setting
        console.log("zoomCameraAt - Applied zoom:", this.mainCamera.zoom);

        // Get the new screen position after zoom
        const newWorldPoint = this.mainCamera.getWorldPoint(
            pointer.x,
            pointer.y
        );

        // Move the camera to counter the zoom
        this.mainCamera.scrollX += worldPoint.x - newWorldPoint.x;
        this.mainCamera.scrollY += worldPoint.y - newWorldPoint.y;

        // Call constrainCamera AFTER applying the zoom and position changes
        this.constrainCamera();
    }

    // This method ensures the camera doesn't show areas beyond the world bounds
    constrainCamera() {
        if (!this.mainCamera) return;

        // Calculate the visible area in world coordinates based on current zoom
        const visibleWidth = this.cameras.main.width / this.mainCamera.zoom;
        const visibleHeight = this.cameras.main.height / this.mainCamera.zoom;

        // Calculate safe boundaries to ensure the camera doesn't show beyond the world edges
        const minX = visibleWidth / 2;
        const minY = visibleHeight / 2;
        const maxX = this.worldSize.width - visibleWidth / 2;
        const maxY = this.worldSize.height - visibleHeight / 2;

        // Calculate the camera's current center point
        const cameraCenterX = this.mainCamera.scrollX + visibleWidth / 2;
        const cameraCenterY = this.mainCamera.scrollY + visibleHeight / 2;

        // Constrain the camera center within the safe boundaries
        const constrainedX = Phaser.Math.Clamp(cameraCenterX, minX, maxX);
        const constrainedY = Phaser.Math.Clamp(cameraCenterY, minY, maxY);

        // Update camera scroll position to center on the constrained position
        this.mainCamera.scrollX = constrainedX - visibleWidth / 2;
        this.mainCamera.scrollY = constrainedY - visibleHeight / 2;
    }

    // Creates a placeable image/sprite that the user can drag around.
    private createPlaceable(cfg: PlaceableConfig) {
        const img = this.add
            .image(cfg.x, cfg.y, cfg.key)
            .setOrigin(0.5)
            .setScale(cfg.scale ?? 1)
            .setInteractive({ draggable: true });

        // Add custom properties to track plant-specific data
        if (cfg.id) {
            (img as any).gameObjectType = "plant";
            (img as any).plantId = cfg.id;
        }

        // ensure it lives in the worldContainer so camera pans/zooms affect it
        this.worldContainer.add(img);

        img.on("pointerdown", () => {
            if ((img as any).gameObjectType === "plant") {
                console.log(`Selected plant with ID: ${(img as any).plantId}`);
                // Add additional visual feedback or display information here
                if (this.selectedPlantText) {
                    this.selectedPlantText.destroy();
                }
                this.selectedPlantText = this.add
                    .text(cfg.x, cfg.y - 60, `Harvest: ${cfg.key}`, {
                        fontFamily: "Arial",
                        fontSize: "18px",
                        color: "#00ff00",
                        backgroundColor: "#222",
                        padding: { x: 8, y: 4 },
                    })
                    .setOrigin(0.5)
                    .setDepth(100)
                    .setInteractive({ useHandCursor: true });
                this.worldContainer.add(this.selectedPlantText);
                this.selectedPlantText.on("pointerdown", () => {
                    this.publishHarvestEvent(cfg.key);
                });
                this.input.once(
                    "pointerdown",
                    (pointer: Phaser.Input.Pointer, _gameObjects: any[]) => {
                        // Only remove if not clicking the same plant again
                        if (
                            !img
                                .getBounds()
                                .contains(pointer.worldX, pointer.worldY)
                        ) {
                            if (this.selectedPlantText) {
                                this.selectedPlantText.destroy();
                                this.selectedPlantText = undefined;
                            }
                        }
                    }
                );
            }
            if (cfg.key === "gold-storage") {
                console.log("Gold storage clicked");
                // Add additional visual feedback or display information here
            }
        });

        return img;
    }

    update() {
        // Ensure camera stays within bounds during updates
        this.constrainCamera();
    }

    private async publishPlantSeedEvent(
        itemKey: string,
        name: string,
        x: string,
        y: string
    ) {
        const client = await getMomentoClient();
        const instance = AuthService.getInstance();
        const user = instance.getUserFromIdToken();
        const payload: PlantSeededEvent = {
            eventType: "PlantSeeded",
            playerId: user.userId,
            timestamp: new Date().toISOString(),
            payload: {
                plantId: itemKey,
                plantName: name,
                xCoordinate: x,
                yCoordinate: y,
            },
        };
        const rs = await client.publish(
            "clash-of-farms-cache",
            "clash-of-farms-topic",
            JSON.stringify(payload)
        );
        // console.log(`Here is the ${rs}`);
    }

    private async publishHarvestEvent(itemKey: string) {
        const client = await getMomentoClient();
        const instance = AuthService.getInstance();
        const user = instance.getUserFromIdToken();
        const payload: PlantHarvestedEvent = {
            eventType: "PlantHarvested",
            playerId: user.userId,
            timestamp: new Date().toISOString(),
            payload: {
                plantId: itemKey,
            },
        };
        const rs = await client.publish(
            "clash-of-farms-cache",
            "clash-of-farms-topic",
            JSON.stringify(payload)
        );
        // console.log(`Here is the ${rs}`);
    }
}

