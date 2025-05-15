import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
  CacheDictionaryFetch,
} from "@gomomento/sdk";

import { docClient } from "shared/src/lib/dynamoClient";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { momentoTtl } from "shared/src/lib/defaultMomentoTtl";
import { headers } from "src/services/headers";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;
const CACHE_NAME = process.env.CACHE_NAME!;

export const handler: APIGatewayProxyHandler = async (
  event
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
  const playerId = event.pathParameters?.playerId;

  if (!playerId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: "Missing playerId in path." }),
    };
  }

  if (!GAME_TABLE_NAME) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Table name not configured." }),
    };
  }

  try {
    // 1. Fetch player profile to get PreferredUsername
    const profileRes = await docClient.send(
      new GetCommand({
        TableName: GAME_TABLE_NAME,
        Key: { PK: `PLAYER#${playerId}`, SK: `PROFILE#` },
      })
    );
    const profile = profileRes.Item;
    if (!profile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "Player not found." }),
      };
    }
    const userKey =
      (profile.PreferredUsername as string) || `player:${playerId}`;

    // 2. Initialize Momento client
    const apiKey = await getMomentoApiKey();
    const cache = new CacheClient({
      configuration: Configurations.Lambda.latest(),
      credentialProvider: CredentialProvider.fromString(apiKey),
      defaultTtlSeconds: momentoTtl,
    });

    // 3. Try reading plant counts from cache
    const fetchCounts = await cache.dictionaryFetch(
      CACHE_NAME,
      `${userKey}#Plants`
    );
    if (fetchCounts instanceof CacheDictionaryFetch.Hit) {
      const entries = fetchCounts.value();
      console.log(`Here are the entries: ${entries}`);
      // If cache empty, treat as miss
      if (entries && Object.keys(entries).length > 0) {
        // Build plant objects
        const plants = await Promise.all(
          Object.entries(entries)
            .filter(([field]) => field.startsWith("Plants:"))
            .map(async ([field, value]) => {
              const name = field.split(":")[1];
              const quantity = Number(value);
              if (isNaN(quantity)) {
                console.error(`Invalid quantity for plant ${name}:`, value);
                return null; // Skip invalid entries
              }

              // Fetch coords from their own dict
              const coordsKey = `${userKey}#${name}#coords`;
              const coordsRes = await cache.dictionaryFetch(
                CACHE_NAME,
                coordsKey
              );
              const coords =
                coordsRes instanceof CacheDictionaryFetch.Hit
                  ? Object.entries(coordsRes.value()).map(([_, v]) =>
                      JSON.parse(v as string)
                    )
                  : [];
              return { name, quantity, coordinates: coords };
            })
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(plants.filter((p) => p !== null)), // Remove null entries
        };
      }
    }

    // 4. Cache miss or empty: fetch from DynamoDB
    const queryRes = await docClient.send(
      new QueryCommand({
        TableName: GAME_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `PLAYER#${playerId}`,
          ":sk": "PLANT#",
        },
      })
    );

    const items = queryRes.Items || [];
    console.log("Raw DynamoDB items:", JSON.stringify(items)); // Debugging log
    const plants = items
      .map((i) => {
        try {
          // Manually parse the DynamoDB item and only include required fields
          const parsedPlant = {
            name: i.Name,
            quantity: i.Quantity,
            coordinates: i.Coordinates.map((coord: any) => ({
              id: coord.id,
              xCoordinate: parseInt(coord.xCoordinate, 10), // Ensure numeric type
              yCoordinate: parseInt(coord.yCoordinate, 10), // Ensure numeric type
            })),
          };
          console.log("Parsed plant:", parsedPlant); // Debugging log
          return parsedPlant;
        } catch (error) {
          console.error("Error parsing item:", i, error);
          return null; // Skip invalid items
        }
      })
      .filter((p) => p !== null); // Remove null entries

    // 5. Populate cache
    await Promise.all(
      plants.map(async ({ name, quantity, coordinates }) => {
        // set count
        await cache.dictionarySetField(
          CACHE_NAME,
          `${userKey}#Plants`,
          `Plants:${name}`,
          quantity.toString()
        );
        // set coords
        const coordsKey = `${userKey}#${name}#coords`;
        for (const coord of coordinates) {
          await cache.dictionarySetField(
            CACHE_NAME,
            coordsKey,
            coord.id,
            JSON.stringify(coord)
          );
        }
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(plants),
    };
  } catch (error) {
    console.error("Error getting plants:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
