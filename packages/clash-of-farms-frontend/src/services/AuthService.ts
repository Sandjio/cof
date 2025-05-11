import jwtDecode from "jwt-decode";

export class AuthService {
    private static instance: AuthService;
    private tokens: {
        idToken: string | null;
        accessToken: string | null;
        refreshToken: string | null;
    };

    private constructor() {
        this.tokens = {
            idToken: null,
            accessToken: null,
            refreshToken: null,
        };

        // Initialize tokens from localStorage (if in browser environment)
        if (typeof window !== "undefined") {
            this.loadTokensFromStorage();
        }
    }

    public static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    /**
     * Load tokens from localStorage
     */
    private loadTokensFromStorage(): void {
        try {
            const storedTokens = localStorage.getItem("auth_tokens");
            if (storedTokens) {
                this.tokens = JSON.parse(storedTokens);
            }
        } catch (error) {
            console.error("Failed to load tokens from storage:", error);
        }
    }

    /**
     * Save tokens to localStorage
     */
    private saveTokensToStorage(): void {
        try {
            localStorage.setItem("auth_tokens", JSON.stringify(this.tokens));
        } catch (error) {
            console.error("Failed to save tokens to storage:", error);
        }
    }

    /**
     * Exchange authorization code for tokens
     */
    public async exchangeCodeForTokens(code: string): Promise<boolean> {
        try {
            const tokenEndpoint = `${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}/oauth2/token`;
            const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;
            const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

            const body = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: clientId as string,
                code,
                redirect_uri: redirectUri as string,
            });

            const response = await fetch(tokenEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
            });

            if (!response.ok) {
                throw new Error(
                    `Error exchanging code for tokens: ${response.statusText}`
                );
            }

            const data = await response.json();

            this.tokens = {
                idToken: data.id_token,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
            };

            // Save tokens to localStorage
            this.saveTokensToStorage();

            return true;
        } catch (error) {
            console.error("Failed to exchange code for tokens:", error);
            return false;
        }
    }

    /**
     * Get the current ID token
     */
    public getIdToken(): string | null {
        return this.tokens.idToken;
    }

    /**
     * Get the current access token
     */
    public getAccessToken(): string | null {
        return this.tokens.accessToken;
    }

    /**
     * Check if the user is authenticated
     */
    public isAuthenticated(): boolean {
        return !!this.tokens.idToken;
    }

    /**
     * Clear all tokens (logout)
     */
    public logout(): void {
        this.tokens = {
            idToken: null,
            accessToken: null,
            refreshToken: null,
        };

        // Clear tokens from localStorage
        if (typeof window !== "undefined") {
            localStorage.removeItem("auth_tokens");
        }
    }

    public getUserFromIdToken() {
        const idToken = this.getIdToken();
        if (!idToken) {
            throw new Error("ID Token is null or undefined");
        }
        const decoded = jwtDecode<{
            email: string;
            sub: string;
            preferred_username: string;
        }>(idToken);

        return {
            email: decoded.email,
            userId: decoded.sub,
            username: decoded.preferred_username,
        };
    }
}

