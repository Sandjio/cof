import { APIGatewayProxyHandler } from "aws-lambda";
import { docClient } from "shared/src/lib/dynamoClient";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { playerId, recipeName, troops } = body;

    if (!playerId || !recipeName || !Array.isArray(troops)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required fields: playerId, recipeName, troops[]",
        }),
      };
    }

    const recipeId = uuidv4();
    const timestamp = new Date().toISOString();

    const item = {
      PK: `PLAYER#${playerId}`,
      SK: `BATTLE_RECIPE#${recipeId}`,
      entityType: "BattleRecipe",
      recipeId,
      playerId,
      recipeName,
      troops, // Should be [{ troopType: string, count: number }]
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await docClient.send(
      new PutCommand({
        TableName: GAME_TABLE_NAME,
        Item: item,
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Battle recipe created", recipeId }),
    };
  } catch (err) {
    console.error("Error creating recipe:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
