import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient } from "shared/src/lib/dynamoClient";
import { safeLog } from "shared/src/lib/safeLogs";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { initializeMomento } from "shared/src/lib/momentoClient";

import {
  PutItemCommand,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { CacheClient } from "@gomomento/sdk";

const CACHE_NAME = process.env.CACHE_NAME!;
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
const lockTTLSeconds = 180;

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
