import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient } from "../../../../shared/src/lib/dynamoClient";

// Environment Variables
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || "{}");

    const { name, type, cost, playerId } = body;

    // Basic validation
    if (!name || !cost || !playerId) {
      return {
        statusCode: 400,
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
        body: JSON.stringify({ message: "Player not found." }),
      };
    }

    // 2. Check Gold
    if (player.gold < cost) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Not enough gold to buy this plant." }),
      };
    }

    // 3. Create the Plant
    const plantId = uuidv4();
    const now = new Date().toISOString();
    const plantItem = {
      PK: `PLAYER#${playerId}`,
      SK: `PLANT#${plantId}`,
      plantId,
      name,
      type: type || "unknown",
      cost,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: GAME_TABLE_NAME,
              Item: plantItem,
              // you could add a condition here to ensure no duplicate plantId

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

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Plant purchased successfully!",
        plant: plantItem,
        newGoldAmount: player.gold - cost,
      }),
    };
  } catch (error) {
    console.error("Error purchasing plant:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to purchase plant." }),
    };
  }
};
