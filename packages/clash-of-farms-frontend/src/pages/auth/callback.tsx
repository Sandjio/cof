import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AuthService } from "@/services/AuthService";

// This component handles the Cognito callback
export default function CognitoCallback() {
    const router = useRouter();
    const [status, setStatus] = useState("Processing authentication...");

    useEffect(() => {
        // Only run this code when the component is mounted and the router is ready
        if (!router.isReady) return;

        async function handleAuthCode() {
            try {
                const { code } = router.query;

                // Make sure we have a code
                if (!code || Array.isArray(code)) {
                    setStatus("Invalid authentication code.");
                    return;
                }

                // Get auth service instance
                const authService = AuthService.getInstance();

                // Exchange the code for tokens
                setStatus("Exchanging code for tokens...");
                const success = await authService.exchangeCodeForTokens(code);

                if (success) {
                    setStatus("Authentication successful! Redirecting...");

                    // Redirect to the game page after a short delay
                    setTimeout(() => {
                        router.push("/game");
                    }, 1000);
                } else {
                    setStatus("Authentication failed. Please try again.");

                    // Redirect to home page after a short delay
                    setTimeout(() => {
                        router.push("/");
                    }, 2000);
                }
            } catch (error) {
                console.error("Authentication error:", error);
                setStatus("Authentication error. Redirecting to home...");

                setTimeout(() => {
                    router.push("/");
                }, 2000);
            }
        }

        handleAuthCode();
    }, [router.isReady, router.query]);

    return (
        <div
            className="auth-callback-container"
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                backgroundColor: "#000",
                color: "#fff",
                textAlign: "center",
                fontFamily: "Arial, sans-serif",
            }}
        >
            <div>
                <h1>Authentication</h1>
                <p>{status}</p>
            </div>
        </div>
    );
}

