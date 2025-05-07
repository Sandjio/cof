import { useRouter } from "next/router";
import { useEffect } from "react";
import axios from "axios";

const CallbackPage = () => {
    const router = useRouter();

    useEffect(() => {
        const exchangeCode = async () => {
            const code = router.query.code as string;
            if (!code) return;

            const body = new URLSearchParams();
            body.append("grant_type", "authorization_code");
            body.append(
                "client_id",
                process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!
            );
            body.append("code", code);
            body.append("redirect_uri", process.env.NEXT_PUBLIC_REDIRECT_URI!);

            try {
                const response = await axios.post(
                    `${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}/oauth2/token`,
                    body,
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    }
                );

                const { id_token, access_token } = response.data;

                localStorage.setItem("id_token", id_token);
                localStorage.setItem("access_token", access_token);

                router.push("/"); // route protégée vers le jeu
            } catch (err) {
                console.error("Token exchange failed", err);
            }
        };

        exchangeCode();
    }, [router]);

    return <p>Loading...</p>;
};

export default CallbackPage;

