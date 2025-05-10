/**
 * Extract the authorization code from URL query parameters
 */
export function getAuthCodeFromUrl(): string | null {
    // Check if we're in a browser environment
    if (typeof window === "undefined") {
        return null;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    // Remove the code from URL to prevent issues with refreshing
    if (code) {
        // Create a new URL without the code parameter
        const url = new URL(window.location.href);
        url.searchParams.delete("code");

        // Replace the current URL without reloading the page
        window.history.replaceState({}, document.title, url.toString());
    }

    return code;
}
