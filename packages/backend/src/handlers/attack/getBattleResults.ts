import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { docClient } from "shared/src/lib/dynamoClient";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;

export const handler: APIGatewayProxyHandler = async (
  event
): Promise<APIGatewayProxyResult> => {
  const battleId = event.pathParameters?.battleId;
  const body = JSON.parse(event.body || "{}");
  const { playerId } = body;

  if (!body || !body.playerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "PlayerId is required.",
      }),
    };
  }

  if (!battleId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing battleId",
      }),
    };
  }

  if (!GAME_TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Table name not configured." }),
    };
  }

  try {
    const command = new QueryCommand({
      TableName: GAME_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `PLAYER#${playerId}` },
        ":skPrefix": { S: `BATTLE#${battleId}` },
      },
    });
    const result = await docClient.send(command);

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Battle not found.",
        }),
      };
    }

    const battleResults = (result.Items || []).map((item) => unmarshall(item));

    return {
      statusCode: 200,
      body: JSON.stringify(battleResults),
    };
  } catch (error) {
    console.error("Error querying battle results:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
