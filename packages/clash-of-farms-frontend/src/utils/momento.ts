import { AuthService } from "@/services/AuthService";
// import { TopicClientConfiguration } from "@gomomento/sdk";
import {
    CredentialProvider,
    TopicClient,
    TopicConfigurations,
} from "@gomomento/sdk-web";
const apiDomain = process.env.NEXT_PUBLIC_API_DOMAIN;

export const fetchMomentoToken = async () => {
    const instance = AuthService.getInstance();
    const idToken = instance.getIdToken();
    const endpoint = `${apiDomain}/tokens`;
    const response = await fetch(endpoint, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Token vending failed: ${response.statusText}`);
    }
    const { token } = await response.json();
    // console.log(`Here is the Token: ${token}`);
    return token;
};

export const getMomentoClient = async () => {
    const token = await fetchMomentoToken();
    const momentoClient = new TopicClient({
        configuration: TopicConfigurations.Default.latest(),
        credentialProvider: CredentialProvider.fromString(token),
    });
    return momentoClient;
};

