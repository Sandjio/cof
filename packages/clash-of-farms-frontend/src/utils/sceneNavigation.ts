/**
 * Utility functions for scene navigation and management
 */

/**
 * Start a new scene with transition effects
 *
 * @param currentScene - The current Phaser scene
 * @param targetSceneKey - The key of the scene to transition to
 * @param data - Optional data to pass to the new scene
 */
export function changeScene(
    currentScene: Phaser.Scene,
    targetSceneKey: string,
    data: any = {}
) {
    // Add transition effect - fade out current scene
    currentScene.cameras.main.fadeOut(500);

    currentScene.cameras.main.once("camerafadeoutcomplete", () => {
        // Stop current scene and start target scene
        currentScene.scene.start(targetSceneKey, data);
    });
}

/**
 * Start a scene that runs simultaneously with the current scene
 *
 * @param currentScene - The current Phaser scene
 * @param targetSceneKey - The key of the scene to launch
 * @param data - Optional data to pass to the new scene
 */
export function launchOverlayScene(
    currentScene: Phaser.Scene,
    targetSceneKey: string,
    data: any = {}
) {
    currentScene.scene.launch(targetSceneKey, data);
}

/**
 * Pause current scene and start new scene (useful for menus, inventories, etc.)
 *
 * @param currentScene - The current Phaser scene
 * @param targetSceneKey - The key of the scene to launch
 * @param data - Optional data to pass to the new scene
 */
export function pauseAndLaunchScene(
    currentScene: Phaser.Scene,
    targetSceneKey: string,
    data: any = {}
) {
    // Pause the current scene
    currentScene.scene.pause();

    // Launch the target scene
    currentScene.scene.launch(targetSceneKey, data);
}

/**
 * Resume a paused scene and stop the current scene
 *
 * @param currentScene - The current Phaser scene
 * @param sceneKeyToResume - The key of the scene to resume
 */
export function resumePreviousScene(
    currentScene: Phaser.Scene,
    sceneKeyToResume: string
) {
    // Resume the target scene
    currentScene.scene.resume(sceneKeyToResume);

    // Stop the current scene
    currentScene.scene.stop();
}
