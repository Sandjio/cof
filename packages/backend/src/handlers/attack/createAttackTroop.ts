import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
} from "@gomomento/sdk";

import { docClient } from "shared/src/lib/dynamoClient";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { momentoTtl } from "shared/src/lib/defaultMomentoTtl";
import { headers } from "src/services/headers";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;
const CACHE_NAME = process.env.CACHE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "http://localhost:8080",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
        "Access-Control-Allow-Credentials": "true",
      },
      body: "",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { name, type, cost, playerId } = body;
    // Basic validation
    if (!name || !cost || !playerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: "Name, cost, and playerId are required.",
        }),
      };
    }
    // 1. Fetch Player Profile
    const playerResult = await docClient.send(
      new GetCommand({
        TableName: GAME_TABLE_NAME,
        Key: { PK: `PLAYER#${playerId}`, SK: `PROFILE#` },
      })
    );

    const player = playerResult.Item;

    if (!player) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "Player not found." }),
      };
    }

    // 2. Check Gold
    if (player.gold < cost) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: "Not enough gold to buy this Attack Troop.",
        }),
      };
    }

    // 3. Create Attack Troop
    const attackTroopId = uuidv4();
    const now = new Date().toISOString();
    const AttackTroopItem = {
      PK: `PLAYER#${playerId}`,
      SK: `ATTACK_TROOP#${attackTroopId}`,
      attackTroopId,
      name,
      type: type || "unknown",
      cost,
      createdAt: now,
      updatedAt: now,
    };

    // 4. Update Player Gold
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: GAME_TABLE_NAME,
              Item: AttackTroopItem,
              ConditionExpression:
                "attribute_not_exists(PK) AND attribute_not_exists(SK)",
            },
          },
          {
            Update: {
              TableName: GAME_TABLE_NAME,
              Key: {
                PK: `PLAYER#${playerId}`,
                SK: `PROFILE#`,
              },
              UpdateExpression: "SET gold = gold - :cost",
              ConditionExpression: "gold >= :cost",
              ExpressionAttributeValues: {
                ":cost": cost,
              },
            },
          },
        ],
      })
    );

    // get Momento API key & client
    const apiKey = await getMomentoApiKey();
    const credProvider = CredentialProvider.fromString(apiKey);

    const cacheClient = new CacheClient({
      configuration: Configurations.Lambda.latest(),
      credentialProvider: credProvider,
      defaultTtlSeconds: momentoTtl,
    });

    // Update the value in the cache
    await cacheClient.dictionaryIncrement(
      CACHE_NAME,
      player.preferredUsername,
      "gold",
      -cost
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: "Attack Troop created successfully.",
        attackTroop: AttackTroopItem,
        newGoldAmount: player.gold - cost,
      }),
    };
  } catch (error) {
    console.error("Error creating attack troop:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: "Failed to create attack troop.",
      }),
    };
  }
};
