import {
  CacheClient,
  CredentialProvider,
  Configurations,
} from "@gomomento/sdk";
import { safeLog } from "./safeLogs";
import { getMomentoApiKey } from "./getAuthToken";

import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../..", ".env") });
let cacheClient: CacheClient | null = null;
const CACHE_NAME = process.env.CACHE_NAME!;
const lockTTLSeconds = 180;

/**
 * Initialize Momento client with robust error handling
 */
export const initializeMomento = async (): Promise<CacheClient> => {
  try {
    if (cacheClient) {
      safeLog(`Reusing existing Momento client`);
      return cacheClient;
    }

    safeLog(`Initializing new Momento client`);
    const apiKey = await getMomentoApiKey();

    // Debug token format without exposing it
    if (!apiKey) {
      safeLog(`API key is undefined or empty`);
      throw new Error("API key is undefined or empty");
    }

    safeLog(
      `API key retrieved, length: ${apiKey.length}, first char: ${apiKey.charAt(
        0
      )}`
    );

    // Try creating a credential provider first to isolate any token issues
    try {
      safeLog(`Creating credential provider`);
      const credProvider = CredentialProvider.fromString(apiKey);
      safeLog(`Credential provider created successfully`);

      // Now create the full cache client
      safeLog(`Creating cache client with configuration: Lambda.latest()`);
      cacheClient = new CacheClient({
        configuration: Configurations.Lambda.latest(),
        credentialProvider: credProvider,
        defaultTtlSeconds: lockTTLSeconds,
      });

      // Optional: Test the connection
      safeLog(`Testing connection to cache: ${CACHE_NAME}`);
      try {
        const pingResult = await cacheClient.ping();
        safeLog(`Ping successful`);
      } catch (pingError) {
        safeLog(`Ping failed, but continuing:`, pingError);
        // Continue anyway - the ping might fail but other operations might work
      }

      return cacheClient;
    } catch (credError) {
      safeLog(`Error creating credential provider:`, credError);
      throw new Error(
        `Failed to create Momento credential provider: ${
          credError instanceof Error ? credError.message : "Unknown error"
        }`
      );
    }
  } catch (error) {
    safeLog(`Failed to initialize Momento client:`, error);
    throw error;
  }
};
