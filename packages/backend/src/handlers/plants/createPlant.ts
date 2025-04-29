import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient } from "../../../../shared/src/lib/dynamoClient";

// Environment Variables
const PLANTS_TABLE_NAME = process.env.PLANTS_TABLE_NAME!;
const PLAYERS_TABLE_NAME = process.env.PLAYERS_TABLE_NAME!;

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
        TableName: PLAYERS_TABLE_NAME,
        Key: { playerId },
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
    const plant = {
      plantId: uuidv4(),
      playerId,
      name,
      type: type || "unknown",
      cost,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: PLANTS_TABLE_NAME,
        Item: plant,
      })
    );

    // 4. Deduct Gold from Player
    await docClient.send(
      new UpdateCommand({
        TableName: PLAYERS_TABLE_NAME,
        Key: { playerId },
        UpdateExpression: "SET gold = gold - :cost",
        ExpressionAttributeValues: {
          ":cost": cost,
        },
        ConditionExpression: "gold >= :cost", // Prevent race conditions
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Plant purchased successfully!",
        plant,
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
