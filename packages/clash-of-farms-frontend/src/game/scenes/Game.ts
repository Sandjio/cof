import { GameObjects, Scene, Math as PhaserMath } from "phaser";

import { EventBus } from "../EventBus";

export class Game extends Scene {
    // Camera control properties
    private isDragging: boolean = false;
    private lastPointerPosition: { x: number; y: number } | null = null;
    private worldSize = {
        width: window.innerWidth,
        height: window.innerHeight,
    }; // Adjust based on your map size
    private minimapCamera?: Phaser.Cameras.Scene2D.Camera;
    private mainCamera?: Phaser.Cameras.Scene2D.Camera;
    constructor() {
        super("Game");
    }

    create() {
        // Set up the world
        this.createWorld();

        // Set up the main camera with boundaries
        this.setupMainCamera();

        // Set up camera controls
        this.setupCameraControls();

        this.placeFarmHouse();

        // Optional: Set up minimap
        // this.setupMinimap();

        // Notify that the scene is ready
        EventBus.emit("current-scene-ready", this);
    }

    placeFarmHouse() {
        // Create town hall in the center of the map
        const centerX = this.worldSize.width / 2;
        const centerY = this.worldSize.height / 2;

        const barn = this.add
            .image(centerX, centerY, "barn")
            .setOrigin(0.5, 0.5);
        barn.setScale(0.1); // Adjust scale as needed

        // Focus camera on town hall
        if (this.mainCamera) {
            this.mainCamera.centerOn(centerX, centerY);
        }

        // Listen for town hall selection events
        this.events.on("building-selected", (building) => {
            console.log("Town Hall selected");
            // Implement your UI elements or game logic when town hall is selected
            // For example, show upgrade options or building details
        });
    }

    createWorld() {
        // Create a large world for the player to navigate
        const tileWidth = 256; // Your ground tile width
        const tileHeight = 128;

        const effectiveHeight = tileHeight / 2;

        const tilesWidth =
            Math.ceil(this.worldSize.width / (tileWidth / 2)) + 4; // Add padding
        const tilesHeight =
            Math.ceil(this.worldSize.height / effectiveHeight) + 4; // Add padding
        // Example: Use a repeating pattern or tilemap

        // Extend the world size to ensure full coverage
        this.worldSize.width = tilesWidth * (tileWidth / 2);
        this.worldSize.height = tilesHeight * effectiveHeight;

        const ground = this.add
            .tileSprite(
                -tileWidth * 2,
                -tileHeight * 2, // Position slightly outside the visible area
                this.worldSize.width + tileWidth * 4,
                this.worldSize.height + tileHeight * 4,
                "ground"
            )
            .setOrigin(0)
            .setDepth(0);

        // Define world bounds for physics and camera
        this.physics.world.setBounds(
            0,
            0,
            this.worldSize.width,
            this.worldSize.height
        );
    }

    setupMainCamera() {
        // Get reference to main camera
        this.mainCamera = this.cameras.main;

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

        // Set up camera zoom limits
        this.mainCamera.setZoom(1); // Start zoom

        // Optional: Add some lerping for smooth camera movement
        this.mainCamera.setLerp(0.1);

        // Add padding to ensure no edges are visible when zooming out
        // This effectively restricts how far the camera can move near the edges
        const padding = 100; // Adjust this value based on your needs
        this.mainCamera.setViewport(
            padding,
            padding,
            this.scale.width - padding * 2,
            this.scale.height - padding * 2
        );
    }

    setupCameraControls() {
        // Setup pointer down for dragging
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastPointerPosition = { x: pointer.x, y: pointer.y };
        });

        // Setup pointer move for camera movement
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (!this.isDragging || !this.lastPointerPosition) return;

            // Calculate the distance moved
            const deltaX = pointer.x - this.lastPointerPosition.x;
            const deltaY = pointer.y - this.lastPointerPosition.y;

            // Update camera position (invert movement to make it feel like you're grabbing the world)
            if (this.mainCamera) {
                this.mainCamera.scrollX -= deltaX / this.mainCamera.zoom;
            }
            if (this.mainCamera) {
                this.mainCamera.scrollY -= deltaY / this.mainCamera.zoom;
            }

            // Ensure camera stays within safe area to prevent seeing beyond world edges when zoomed out
            this.constrainCamera();

            // Update last position
            this.lastPointerPosition = { x: pointer.x, y: pointer.y };
        });

        // Setup pointer up to stop dragging
        this.input.on("pointerup", () => {
            this.isDragging = false;
            this.lastPointerPosition = null;
        });

        // Setup mouse wheel for zooming - similar to how Clash of Clans allows pinch-zoom
        this.input.on(
            "wheel",
            (
                pointer: any,
                gameObjects: any,
                deltaX: number,
                deltaY: number
            ) => {
                // Calculate new zoom level
                const zoomChange = -deltaY * 0.001; // Adjust sensitivity as needed
                let newZoom = this.mainCamera!.zoom + zoomChange;

                // Clamp zoom between min and max values
                newZoom = PhaserMath.Clamp(newZoom, 0.7, 2);

                // Apply new zoom centered on pointer position
                this.zoomCameraAt(pointer, newZoom);
            }
        );

        // For mobile: pinch to zoom
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
                    const zoomChange = distanceChange * 0.002; // Adjust sensitivity
                    let newZoom = this.mainCamera!.zoom + zoomChange;

                    // Clamp zoom between min and max
                    newZoom = PhaserMath.Clamp(newZoom, 0.5, 2);

                    // Find center point between fingers for zoom center
                    const centerX = (p1.x + p2.x) / 2;
                    const centerY = (p1.y + p2.y) / 2;
                    const centerPointer = { x: centerX, y: centerY };

                    // Apply zoom
                    this.zoomCameraAt(centerPointer, newZoom);
                }

                prevDistance = distance;
            } else {
                prevDistance = 0;
            }
        });
    }

    zoomCameraAt(pointer: { x: number; y: number }, zoom: number) {
        // Don't zoom if no camera reference
        if (!this.mainCamera) return;

        // Get the world position before zoom change
        const worldPoint = this.mainCamera.getWorldPoint(pointer.x, pointer.y);

        // Change the zoom
        this.mainCamera.setZoom(zoom);

        // Get the new screen position after zoom
        const newWorldPoint = this.mainCamera.getWorldPoint(
            pointer.x,
            pointer.y
        );

        // Move the camera to counter the zoom
        this.mainCamera.scrollX += worldPoint.x - newWorldPoint.x;
        this.mainCamera.scrollY += worldPoint.y - newWorldPoint.y;

        // Ensure camera stays within safe area to prevent seeing beyond world edges
        this.constrainCamera();
    }
    // This method ensures the camera doesn't show areas beyond the world bounds
    constrainCamera() {
        if (!this.mainCamera) return;

        // Calculate the visible area in world coordinates
        const visibleWidth = this.cameras.main.width / this.mainCamera.zoom;
        const visibleHeight = this.cameras.main.height / this.mainCamera.zoom;

        // Calculate safe boundaries to ensure the camera doesn't show beyond the world edges
        const minX = visibleWidth / 2;
        const minY = visibleHeight / 2;
        const maxX = this.worldSize.width - visibleWidth / 2;
        const maxY = this.worldSize.height - visibleHeight / 2;

        // Calculate the camera's current center point
        const cameraCenterX =
            this.mainCamera.scrollX +
            this.cameras.main.width / 2 / this.mainCamera.zoom;
        const cameraCenterY =
            this.mainCamera.scrollY +
            this.cameras.main.height / 2 / this.mainCamera.zoom;

        // Constrain the camera center within the safe boundaries
        const constrainedX = Phaser.Math.Clamp(cameraCenterX, minX, maxX);
        const constrainedY = Phaser.Math.Clamp(cameraCenterY, minY, maxY);

        // Update camera scroll position to center on the constrained position
        this.mainCamera.scrollX =
            constrainedX - this.cameras.main.width / 2 / this.mainCamera.zoom;
        this.mainCamera.scrollY =
            constrainedY - this.cameras.main.height / 2 / this.mainCamera.zoom;
    }

    setupMinimap() {
        // Create a minimap in top-right corner (like in Clash of Clans)
        const minimapWidth = 150;
        const minimapHeight = 150;
        const minimapX = this.scale.width - minimapWidth - 20;
        const minimapY = 20;

        // Create minimap background
        this.add
            .rectangle(
                minimapX,
                minimapY,
                minimapWidth,
                minimapHeight,
                0x000000,
                0.5
            )
            .setOrigin(0)
            .setScrollFactor(0)
            .setDepth(10);

        // Create secondary camera for minimap
        this.minimapCamera = this.cameras
            .add(minimapX, minimapY, minimapWidth, minimapHeight)
            .setZoom(minimapWidth / this.worldSize.width)
            .setScroll(0, 0)
            .setBounds(0, 0, this.worldSize.width, this.worldSize.height)
            .setBackgroundColor(0x002244)
            .setName("minimap");

        // Create a visible rectangle on minimap showing current view
        const viewportRect = this.add
            .rectangle(0, 0, 1, 1, 0xffffff, 0.3)
            .setStrokeStyle(1, 0xffffff)
            .setDepth(11);

        // Make the minimap ignore the viewport rectangle
        this.minimapCamera.ignore(viewportRect);
    }

    update() {
        // Update the viewport rectangle on the minimap if we have one
        if (this.minimapCamera && this.mainCamera) {
            // Calculate screen-to-world ratio for minimap
            const minimapZoom = this.minimapCamera.zoom;

            // Calculate visible rectangle size
            const visibleWorldWidth =
                this.mainCamera.width / this.mainCamera.zoom;
            const visibleWorldHeight =
                this.mainCamera.height / this.mainCamera.zoom;
            const visibleMinimapWidth = visibleWorldWidth * minimapZoom;
            const visibleMinimapHeight = visibleWorldHeight * minimapZoom;

            // Find all objects with 'minimap-viewport' name
            const viewportRect = this.children
                .getChildren()
                .find(
                    (child) => child.name === "minimap-viewport"
                ) as Phaser.GameObjects.Rectangle;

            if (viewportRect) {
                // Position and resize the rectangle based on camera position
                viewportRect.setPosition(
                    this.mainCamera.scrollX * minimapZoom +
                        this.minimapCamera.x,
                    this.mainCamera.scrollY * minimapZoom + this.minimapCamera.y
                );
                viewportRect.setSize(visibleMinimapWidth, visibleMinimapHeight);
            } else {
                // Create the viewport rectangle if it doesn't exist
                this.add
                    .rectangle(
                        this.mainCamera.scrollX * minimapZoom +
                            this.minimapCamera.x,
                        this.mainCamera.scrollY * minimapZoom +
                            this.minimapCamera.y,
                        visibleMinimapWidth,
                        visibleMinimapHeight,
                        0xffffff,
                        0.3
                    )
                    .setStrokeStyle(1, 0xffffff)
                    .setDepth(11)
                    .setScrollFactor(0)
                    .setName("minimap-viewport");
            }
        }
        this.constrainCamera();
    }
}

