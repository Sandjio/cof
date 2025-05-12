import { AuthService } from "../AuthService";
const apiDomain = process.env.NEXT_PUBLIC_API_DOMAIN;

export const createPlant = async (name: string, type: string, cost: number) => {
    try {
        if (!apiDomain) {
            throw new Error("API domain is not defined");
        }

        if (!AuthService.getInstance().getIdToken()) {
            throw new Error("User is not authenticated");
        }

        const instance = AuthService.getInstance();
        const idToken = instance.getIdToken();
        const playerId = instance.getUserFromIdToken().userId;
        const endpoint = `${apiDomain}/plants`;
        if (!idToken) {
            throw new Error("ID token is null or undefined");
        }
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                type,
                cost,
                playerId,
            }),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to create plant with status: ${response.status}`
            );
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error creating plant:", error);
        return null;
    }
};

export const createDefense = async (
    name: string,
    type: string,
    cost: number
) => {
    try {
        if (!apiDomain) {
            throw new Error("API domain is not defined");
        }

        if (!AuthService.getInstance().getIdToken()) {
            throw new Error("User is not authenticated");
        }

        const instance = AuthService.getInstance();
        const idToken = instance.getIdToken();
        const playerId = instance.getUserFromIdToken().userId;
        const endpoint = `${apiDomain}/defense-troops`;
        if (!idToken) {
            throw new Error("ID token is null or undefined");
        }
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                type,
                cost,
                playerId,
            }),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to create defense with status: ${response.status}`
            );
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error creating defense:", error);
        return null;
    }
};

export const createAttack = async (
    name: string,
    type: string,
    cost: number
) => {
    try {
        if (!apiDomain) {
            throw new Error("API domain is not defined");
        }

        if (!AuthService.getInstance().getIdToken()) {
            throw new Error("User is not authenticated");
        }

        const instance = AuthService.getInstance();
        const idToken = instance.getIdToken();
        const playerId = instance.getUserFromIdToken().userId;
        const endpoint = `${apiDomain}/attack-troops`;
        if (!idToken) {
            throw new Error("ID token is null or undefined");
        }
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                playerId,
                name,
                type,
                cost,
            }),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to create attack with status: ${response.status}`
            );
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error creating attack:", error);
        return null;
    }
};

