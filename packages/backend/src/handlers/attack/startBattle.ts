import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient } from "shared/src/lib/dynamoClient";

import {
  PutItemCommand,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
} from "@gomomento/sdk";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const AWS_REGION = process.env.AWS_REGION;
const CACHE_NAME = process.env.CACHE_NAME || "clash-of-farms-cache";
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
const lockTTLSeconds = 180;
const secretArn = process.env.SECRET_ARN;

let cacheClient: CacheClient | null = null;

/**
 * Safely logs data without exposing sensitive information
 */
const safeLog = (message: string, data?: any) => {
  if (!data) {
    console.log(message);
    return;
  }

  // Create safe version of data for logging
  const safeData = { ...data };
  if (typeof safeData === "object" && safeData !== null) {
    // Redact potential secret values
    if ("SecretString" in safeData) {
      safeData.SecretString = "[REDACTED]";
    }
  }

  console.log(
    message,
    typeof safeData === "object" ? JSON.stringify(safeData) : safeData
  );
};

/**
 * Retrieves the Momento API key from AWS Secrets Manager
 */
const getMomentoApiKey = async (): Promise<string> => {
  if (!secretArn) {
    safeLog(
      `SECRET_ARN environment variable not set. Environment vars:`,
      process.env
    );
    throw new Error("SECRET_ARN environment variable is not defined");
  }

  safeLog(`Retrieving secret from ARN: ${secretArn}`);
  const secretsManagerClient = new SecretsManagerClient({
    region: AWS_REGION || "us-east-1",
  });

  try {
    const secretValueCommand = new GetSecretValueCommand({
      SecretId: secretArn,
    });

    safeLog(`Sending GetSecretValue request for ARN: ${secretArn}`);
    const secretResponse = await secretsManagerClient.send(secretValueCommand);

    safeLog(`Received response from Secrets Manager`);

    if (!secretResponse.SecretString) {
      safeLog(`Secret value is empty or undefined. Response:`, {
        hasSecretString: !!secretResponse.SecretString,
      });
      throw new Error("Secret value is empty or undefined");
    }

    // For debugging only: Check format without exposing the actual value
    safeLog(
      `Secret format check: length=${
        secretResponse.SecretString.length
      }, type=${typeof secretResponse.SecretString}`
    );

    // Check if the secret is JSON
    try {
      // Try to parse as JSON
      const secretObject = JSON.parse(secretResponse.SecretString);
      safeLog(
        `Secret parsed as JSON. Available keys:`,
        Object.keys(secretObject)
      );

      // Check for common API key fields
      if (secretObject.apiKey) {
        safeLog(`Using 'apiKey' field from secret JSON`);
        return secretObject.apiKey;
      } else if (secretObject.token) {
        safeLog(`Using 'token' field from secret JSON`);
        return secretObject.token;
      } else if (secretObject.key) {
        safeLog(`Using 'key' field from secret JSON`);
        return secretObject.key;
      } else if (secretObject.value) {
        safeLog(`Using 'value' field from secret JSON`);
        return secretObject.value;
      } else if (secretObject.momento_api_key) {
        safeLog(`Using 'momento_api_key' field from secret JSON`);
        return secretObject.momento_api_key;
      } else if (secretObject.momentoApiKey) {
        safeLog(`Using 'momentoApiKey' field from secret JSON`);
        return secretObject.momentoApiKey;
      } else if (secretObject.MOMENTO_API_KEY) {
        // Added this field check
        safeLog(`Using 'MOMENTO_API_KEY' field from secret JSON`);
        return secretObject.MOMENTO_API_KEY;
      } else {
        // If we don't find a specific key, log available keys and use the whole string
        safeLog(`No recognized API key field found in JSON. Using raw string.`);
        return secretResponse.SecretString;
      }
    } catch (jsonError) {
      // Not valid JSON, use as a plain string
      safeLog(`Secret is not valid JSON, using as plain string`);
      return secretResponse.SecretString;
    }
  } catch (error) {
    safeLog(`Error retrieving Momento API key from Secrets Manager:`, error);
    if (error instanceof Error) {
      throw new Error(`Failed to retrieve Momento API key: ${error.message}`);
    } else {
      throw new Error("Failed to retrieve Momento API key: Unknown error");
    }
  }
};

/**
 * Initialize Momento client with robust error handling
 */
const initializeMomento = async (): Promise<CacheClient> => {
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

// Implement a mock cache client for fallback
class MockCacheClient {
  private cache = new Map<string, string>();

  async get(cacheName: string, key: string) {
    safeLog(`[MOCK] Getting key ${key} from cache ${cacheName}`);
    const value = this.cache.get(`${cacheName}:${key}`);
    return {
      valueString: () => value,
      value: () => value,
    };
  }

  async set(cacheName: string, key: string, value: string, options?: any) {
    safeLog(
      `[MOCK] Setting key ${key} in cache ${cacheName} to value ${value}`
    );
    this.cache.set(`${cacheName}:${key}`, value);
    return { success: () => true };
  }

  async ping() {
    safeLog(`[MOCK] Ping successful`);
    return { success: () => true };
  }
}

// Try to get a cache client, but fall back to mock if needed
const getCacheClient = async () => {
  try {
    return await initializeMomento();
  } catch (error) {
    safeLog(`Failed to initialize Momento client, using mock:`, error);
    return new MockCacheClient() as unknown as CacheClient;
  }
};

const handleSpecificDefender = async (
  attackerId: string,
  defenderId: string
): Promise<APIGatewayProxyResult> => {
  try {
    // Initialize Momento client first
    const client = await getCacheClient();

    const lockKey = `LOCK#${defenderId}`;
    safeLog(`Checking lock for defender: ${defenderId} with key: ${lockKey}`);

    let isLocked = false;
    try {
      const lockResult = await client.get(CACHE_NAME, lockKey);
      isLocked = !!lockResult.value();
      safeLog(`Lock check result: ${isLocked ? "locked" : "not locked"}`);
    } catch (cacheError) {
      safeLog(`Error checking lock, assuming not locked:`, cacheError);
      isLocked = false;
    }

    if (isLocked) {
      return createErrorResponse(400, "Defender is already in a battle.");
    }

    // Lock the defender and create the battle
    try {
      safeLog(`Setting lock for defender: ${defenderId}`);
      await client.set(CACHE_NAME, lockKey, "LOCKED", { ttl: lockTTLSeconds });
    } catch (lockError) {
      safeLog(`Failed to set lock, continuing anyway:`, lockError);
      // Continue anyway - the battle can proceed even if locking fails
    }

    const battleId = uuidv4();
    const now = new Date().toISOString();

    await createBattleItems(attackerId, defenderId, battleId, now);

    return createSuccessResponse({
      battleId,
      attackerId,
      defenderId,
    });
  } catch (error) {
    safeLog(`Error in handleSpecificDefender:`, error);
    return createErrorResponse(
      500,
      `Error handling specific defender: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

const fetchUnlockedDefender = async (
  attackerId: string
): Promise<string | null> => {
  try {
    // Initialize Momento client first
    const client = await getCacheClient();

    let lastEvaluatedKey = undefined;

    while (true) {
      // Query DynamoDB for the next batch of players
      safeLog(`Querying DynamoDB for players using scan`);
      const result: ScanCommandOutput = await docClient.send(
        new ScanCommand({
          TableName: GAME_TABLE_NAME,
          FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
          ExpressionAttributeValues: {
            ":pkPrefix": { S: "PLAYER#" },
            ":sk": { S: "PROFILE#" },
          },
          Limit: 5, // Fetch 5 players at a time
          ExclusiveStartKey: lastEvaluatedKey, // Continue from the last key
        })
      );

      safeLog(
        `Query result: ${JSON.stringify(result.Items?.length || 0)} items found`
      );

      interface PlayerItem {
        PK: { S: string };
        SK: { S: string };
      }

      const players =
        (result.Items as PlayerItem[] | undefined)
          ?.map((item: PlayerItem) => item.PK.S)
          .filter((pk: string) => pk !== `PLAYER#${attackerId}`) || [];
      lastEvaluatedKey = result.LastEvaluatedKey;

      safeLog(`Found ${players.length} potential opponents`);

      // Check if any player in the batch is unlocked in the cache
      for (const playerPK of players) {
        if (!playerPK) continue;

        // Extract player ID from the PK
        const playerId = playerPK.replace("PLAYER#", "");

        try {
          const lockKey = `LOCK#${playerId}`;
          safeLog(`Checking lock for player: ${playerId} with key: ${lockKey}`);
          const lock = await client.get(CACHE_NAME, lockKey);

          if (!lock.value()) {
            safeLog(`Found unlocked player: ${playerId}`);
            return playerId;
          }
        } catch (cacheError) {
          safeLog(
            `Error checking cache for player ${playerId}, skipping:`,
            cacheError
          );
        }
      }

      // If no unlocked players found and no more items in DynamoDB, stop
      if (!lastEvaluatedKey) {
        safeLog(`No more players to check`);
        break;
      }
    }
  } catch (dbError) {
    safeLog(`Error querying DynamoDB:`, dbError);
    throw new Error(
      `Failed to fetch players from DynamoDB: ${
        dbError instanceof Error ? dbError.message : "Unknown error"
      }`
    );
  }

  return null;
};

const handleRandomDefender = async (
  attackerId: string
): Promise<APIGatewayProxyResult> => {
  try {
    safeLog(`Finding random defender for attacker: ${attackerId}`);
    const defenderId = await fetchUnlockedDefender(attackerId);

    if (!defenderId) {
      return createErrorResponse(404, "No available opponents.");
    }

    // Initialize Momento client
    const client = await getCacheClient();

    // Lock the defender and create the battle
    const lockKey = `LOCK#${defenderId}`;
    safeLog(`Setting lock for random defender: ${defenderId}`);

    try {
      await client.set(CACHE_NAME, lockKey, "LOCKED", { ttl: lockTTLSeconds });
    } catch (lockError) {
      safeLog(`Failed to set lock, continuing anyway:`, lockError);
      // Continue anyway - the battle can proceed even if locking fails
    }

    const battleId = uuidv4();
    const now = new Date().toISOString();

    await createBattleItems(attackerId, defenderId, battleId, now);

    return createSuccessResponse({
      battleId,
      attackerId,
      defenderId,
    });
  } catch (error) {
    safeLog(`Error in handleRandomDefender:`, error);
    return createErrorResponse(
      500,
      `Error handling random defender: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

const createBattleItems = async (
  attackerId: string,
  defenderId: string,
  battleId: string,
  now: string
) => {
  safeLog(
    `Creating battle items for battle ${battleId} between ${attackerId} and ${defenderId}`
  );

  const attackerItem = {
    PK: { S: `PLAYER#${attackerId}` },
    SK: { S: `BATTLE#${battleId}#ATTACKER` },
    BattleID: { S: battleId },
    Role: { S: "ATTACKER" },
    OpponentID: { S: defenderId },
    StartTime: { S: now },
    CreatedAt: { S: now },
    UpdatedAt: { S: now },
  };

  const defenderItem = {
    PK: { S: `PLAYER#${defenderId}` },
    SK: { S: `BATTLE#${battleId}#DEFENDER` },
    BattleID: { S: battleId },
    Role: { S: "DEFENDER" },
    OpponentID: { S: attackerId },
    StartTime: { S: now },
    CreatedAt: { S: now },
    UpdatedAt: { S: now },
  };

  try {
    safeLog(`Writing attacker item to DynamoDB`);
    await docClient.send(
      new PutItemCommand({
        TableName: GAME_TABLE_NAME,
        Item: attackerItem,
      })
    );

    safeLog(`Writing defender item to DynamoDB`);
    await docClient.send(
      new PutItemCommand({
        TableName: GAME_TABLE_NAME,
        Item: defenderItem,
      })
    );

    safeLog(`Successfully created battle items`);
  } catch (dbError) {
    safeLog(`Error writing battle items to DynamoDB:`, dbError);
    if (dbError instanceof Error) {
      throw new Error(
        `Failed to create battle in database: ${dbError.message}`
      );
    } else {
      throw new Error("Failed to create battle in database: Unknown error");
    }
  }
};

const createErrorResponse = (statusCode: number, message: string) => {
  safeLog(`Creating error response: ${statusCode} - ${message}`);
  return {
    statusCode,
    body: JSON.stringify({ message }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  };
};

const createSuccessResponse = (data: object) => {
  safeLog(`Creating success response`);
  return {
    statusCode: 200,
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    safeLog(`Starting battle handler with event:`, {
      method: event.httpMethod,
      path: event.path,
      queryParams: event.queryStringParameters,
      hasBody: !!event.body,
    });

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    safeLog(`Request body:`, body);

    const { attackerId, defenderId } = body;

    if (!attackerId) {
      return createErrorResponse(400, "attackerId is required.");
    }

    if (defenderId) {
      safeLog(`Handling specific defender: ${defenderId}`);
      return await handleSpecificDefender(attackerId, defenderId);
    } else {
      safeLog(`Handling random defender selection`);
      return await handleRandomDefender(attackerId);
    }
  } catch (error) {
    safeLog(`Error in startBattle handler:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return createErrorResponse(500, `Internal server error: ${errorMessage}`);
  }
};
