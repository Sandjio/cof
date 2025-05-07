import Head from "next/head";
import { Inter } from "next/font/google";
import styles from "@/styles/Home.module.css";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EventBus } from "@/game/EventBus";

const inter = Inter({ subsets: ["latin"] });

const AppWithoutSSR = dynamic(() => import("@/App"), { ssr: false });

export default function Home() {
    const [isAuth, setIsAuth] = useState(false);
    useEffect(() => {
        const token = localStorage.getItem("id_token");
        setIsAuth(!!token);
    }, []);
    if (!isAuth) {
        return <p>Not authenticated user</p>;
        // EventBus.emit("user-authenticated");
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
                <AppWithoutSSR />
            </main>
        </>
    );
}

