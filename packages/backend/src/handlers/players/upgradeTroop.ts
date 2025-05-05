import {
  APIGatewayProxyHandler,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from "aws-lambda";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient } from "shared/src/lib/dynamoClient";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body || "{}");
  const { playerId, cost } = body;
  const troopId = event.pathParameters?.troopId;

  try {
    if (!playerId || !troopId || !cost) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "PlayerId,cost and troopId are required.",
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
        body: JSON.stringify({
          message: `Player with ID ${playerId} not found.`,
        }),
      };
    }

    // 2. Check Gold
    if (player.gold < cost) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Insufficient gold. Current gold: ${player.gold}, Cost: ${cost}`,
        }),
      };
    }

    // 3. Fetch Troop
    const troopResult = await docClient.send(
      new QueryCommand({
        TableName: GAME_TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        FilterExpression: "SK = :attackSk OR SK = :defenseSk",
        ExpressionAttributeValues: {
          ":pk": `PLAYER#${playerId}`,
          ":attackSk": `ATTACK_TROOP#${troopId}`,
          ":defenseSk": `DEFENSE_TROOP#${troopId}`,
        },
      })
    );

    const troop = troopResult.Items?.[0];

    if (!troop) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: `Troop with ID ${troopId} not found.`,
        }),
      };
    }

    // 4. Upgrade Troop
    const now = new Date().toISOString();
    const newTroop = {
      ...troop,
      level: troop.level + 1,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: GAME_TABLE_NAME,
              Item: newTroop,
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
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Troop upgraded for player ${playerId}`,
      }),
    };
  } catch (error) {
    console.error("Error upgrading troop:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to upgrade troop.",
      }),
    };
  }
};
