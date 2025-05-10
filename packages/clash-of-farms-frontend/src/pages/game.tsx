import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { AuthService } from "../services/AuthService";

export default function GamePage() {
    const router = useRouter();
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if user is authenticated
        const authService = AuthService.getInstance();

        if (!authService.isAuthenticated()) {
            // Redirect to home if not authenticated
            router.push("/");
            return;
        }

        // Load and initialize the Phaser game only on client side
        async function loadGame() {
            try {
                // Dynamic import for the game module (only loads on client)
                const { StartGame } = await import("../game/main");

                if (gameContainerRef.current) {
                    // Initialize the Phaser game
                    StartGame("game-container");
                    setLoading(false);
                }
            } catch (error) {
                console.error("Failed to load game:", error);
            }
        }

        loadGame();

        // Cleanup function to destroy the game when component unmounts
        return () => {
            if (window.game) {
                window.game.destroy(true);
            }
        };
    }, [router]);

    return (
        <>
            <Head>
                <title>My Phaser Game</title>
                <meta
                    name="description"
                    content="Play my awesome Phaser game"
                />
            </Head>

            <div
                style={{
                    width: "100vw",
                    height: "100vh",
                    margin: 0,
                    padding: 0,
                }}
            >
                {loading && (
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: "#000",
                            color: "#fff",
                            zIndex: 10,
                        }}
                    >
                        <p>Loading game...</p>
                    </div>
                )}
                <div
                    id="game-container"
                    ref={gameContainerRef}
                    style={{ width: "100%", height: "100%" }}
                />
            </div>
        </>
    );
}

