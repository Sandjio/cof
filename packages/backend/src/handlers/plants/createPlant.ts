import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
} from "@gomomento/sdk";
import { headers } from "src/services/headers";
import { docClient } from "shared/src/lib/dynamoClient";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { momentoTtl } from "shared/src/lib/defaultMomentoTtl";

// Environment Variables
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
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

    const { name, type, cost, playerId, xCoordinate, yCoordinate } = body;

    // Basic validation
    if (
      !name ||
      !cost == null ||
      !playerId == null ||
      xCoordinate ||
      yCoordinate
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: "Name, cost, playerId, x and y coordinates are required.",
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

    if (player.Gold < cost) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: "Not enough gold to buy this plant." }),
      };
    }

    const now = new Date().toISOString();
    const instanceId = uuidv4();
    const thisCoord = { id: instanceId, xCoordinate, yCoordinate };
    const plantPK = `PLAYER#${playerId}`;
    const plantSK = `PLANT#${name}`;

    // 3. Try to create the PLANT item if it doesn't exist:
    try {
      // a) First-time purchase: Conditional Put + profile Update
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: GAME_TABLE_NAME,
                Item: {
                  PK: plantPK,
                  SK: plantSK,
                  Name: name,
                  Type: type || "unknown",
                  Quantity: 1,
                  Cost: cost,
                  CreatedAt: now,
                  UpdatedAt: now,
                  Coordinates: [thisCoord],
                },
                ConditionExpression:
                  "attribute_not_exists(PK) AND attribute_not_exists(SK)",
              },
            },
            {
              Update: {
                TableName: GAME_TABLE_NAME,
                Key: {
                  PK: plantPK,
                  SK: `PROFILE#`,
                },
                UpdateExpression: "SET Gold = Gold - :cost",
                ConditionExpression: "Gold >= :cost",
                ExpressionAttributeValues: {
                  ":cost": cost,
                },
              },
            },
          ],
        })
      );
    } catch (error: any) {
      if (
        error.name === "TransactionCanceledException" &&
        Array.isArray(error.CancellationReasons) &&
        error.CancellationReasons[0].Code === "ConditionalCheckFailed"
      ) {
        // b) Already have this plant: Increment & append coord + profile Update
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: GAME_TABLE_NAME,
                  Key: { PK: plantPK, SK: plantSK },
                  UpdateExpression: `
                    SET UpdatedAt = :now,
                        Coordinates = list_append(Coordinates, :coord)
                    ADD Quantity :inc
                  `,
                  ExpressionAttributeValues: {
                    ":now": now,
                    ":inc": 1,
                    ":coord": [thisCoord],
                  },
                  ConditionExpression:
                    "attribute_exists(PK) AND attribute_exists(SK)",
                },
              },
              {
                Update: {
                  TableName: GAME_TABLE_NAME,
                  Key: { PK: plantPK, SK: `PROFILE#` },
                  UpdateExpression: "SET Gold = Gold - :c",
                  ConditionExpression: "Gold >= :c",
                  ExpressionAttributeValues: { ":c": cost },
                },
              },
            ],
          })
        );
      } else {
        throw error;
      }
    }

    // get Momento API key & client
    const apiKey = await getMomentoApiKey();
    const credProvider = CredentialProvider.fromString(apiKey);

    const cache = new CacheClient({
      configuration: Configurations.Lambda.latest(),
      credentialProvider: credProvider,
      defaultTtlSeconds: momentoTtl,
    });
    const userKey = player.PreferredUsername;

    // a) Decrement gold in cache:
    await cache.dictionaryIncrement(CACHE_NAME, userKey, "Gold", -cost);
    // b) Increment this plant’s count in cache:
    await cache.dictionaryIncrement(
      CACHE_NAME,
      `${userKey}#Plants`,
      `Plants:${name}`,
      1
    );
    // c) Record this placement into a Momento List:
    await cache.dictionarySetField(
      CACHE_NAME,
      `${userKey}#${name}#coords`,
      thisCoord.id,
      JSON.stringify(thisCoord)
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: "Plant purchased successfully!",
        plant: {
          name,
          type,
          cost,
          placedAt: now,
          instanceId,
          coordinate: thisCoord,
        },
        gold: player.Gold - cost,
      }),
    };
  } catch (error) {
    console.error("Error purchasing plant:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Failed to purchase plant." }),
    };
  }
};
