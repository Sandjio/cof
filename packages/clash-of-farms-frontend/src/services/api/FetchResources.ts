import { Plant } from "shared/src/types/types";
import { AuthService } from "../AuthService";

const apiDomain = process.env.NEXT_PUBLIC_API_DOMAIN;

export const fetchPlayerStats = async () => {
    try {
        if (!apiDomain) {
            throw new Error("API domain is not defined");
        }
        if (!AuthService.getInstance().getIdToken()) {
            throw new Error("User is not authenticated");
        }
        const instance = AuthService.getInstance();
        const idToken = instance.getIdToken();
        const { userId, username } = instance.getUserFromIdToken();
        const endpoint = `${apiDomain}/players/${userId}?username=${encodeURIComponent(
            username
        )}`;

        if (!idToken) {
            throw new Error("ID token is null or undefined");
        }

        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch player stats with status: ${response.status}`
            );
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching player stats:", error);
        return;
    }
};

export const fetchPlayerPlants = async (): Promise<Plant[]> => {
    try {
        if (!apiDomain) {
            throw new Error("API domain is not defined");
        }
        if (!AuthService.getInstance().getIdToken()) {
            throw new Error("User is not authenticated");
        }
        const instance = AuthService.getInstance();
        const idToken = instance.getIdToken();
        const { userId } = instance.getUserFromIdToken();
        const endpoint = `${apiDomain}/gardens/${userId}/plants`;

        if (!idToken) {
            throw new Error("ID token is null or undefined");
        }

        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch plants with status: ${response.status}`
            );
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching plants:", error);
        return [];
    }
};

