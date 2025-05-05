import { APIGatewayProxyHandler } from "aws-lambda";
import { docClient } from "shared/src/lib/dynamoClient";
import { QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const playerId = event.pathParameters?.playerId;

  if (!playerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing path parameter: playerId" }),
    };
  }

  try {
    const queryParams: QueryCommandInput = {
      TableName: GAME_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `PLAYER#${playerId}`,
        ":skPrefix": "BATTLE_RECIPE#",
      },
    };

    const result = await docClient.send(new QueryCommand(queryParams));

    return {
      statusCode: 200,
      body: JSON.stringify({
        recipes: result.Items || [],
      }),
    };
  } catch (error) {
    console.error("Error fetching battle recipes:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
