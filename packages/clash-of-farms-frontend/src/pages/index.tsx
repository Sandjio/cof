import Head from "next/head";
import { Inter } from "next/font/google";
import styles from "@/styles/Home.module.css";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";
import { useRouter } from "next/router";

const inter = Inter({ subsets: ["latin"] });

// const AppWithoutSSR = dynamic(() => import("@/App"), { ssr: false });

export default function Home() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if user is already authenticated
        const authService = AuthService.getInstance();

        if (authService.isAuthenticated()) {
            // Redirect to game page if already authenticated
            router.push("/game");
            return;
        }

        setLoading(false);
    }, [router]);

    const handleLogin = () => {
        // Redirect to Cognito login
        const loginUrl = `${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}/login?client_id=${process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${process.env.NEXT_PUBLIC_REDIRECT_URI}`;
        window.location.href = loginUrl;
    };

    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                    backgroundColor: "#000",
                    color: "#fff",
                }}
            >
                <p>Loading...</p>
            </div>
        );
    }
    return (
        <>
            <Head>
                <title>Clash Of Farms</title>
                <meta
                    name="description"
                    content="A Phaser 3 Next.js project template that demonstrates Next.js with React communication and uses Vite for bundling."
                />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <link rel="icon" href="/favicon.png" />
            </Head>
            <main className={`${styles.main} ${inter.className}`}>
                {/* <AppWithoutSSR /> */}
                <h1>Welcome to My Game</h1>
                <p>Login to start playing!</p>
                <button
                    onClick={handleLogin}
                    style={{
                        backgroundColor: "#4CAF50",
                        border: "none",
                        color: "white",
                        padding: "15px 32px",
                        textAlign: "center",
                        textDecoration: "none",
                        display: "inline-block",
                        fontSize: "16px",
                        margin: "4px 2px",
                        cursor: "pointer",
                        borderRadius: "4px",
                    }}
                >
                    Login
                </button>
            </main>
        </>
    );
}

