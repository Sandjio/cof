import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { docClient } from "shared/src/lib/dynamoClient";

export const handler: APIGatewayProxyHandler = async (
  event
): Promise<APIGatewayProxyResult> => {
  const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
  const playerId = event.pathParameters?.playerId;

  if (!GAME_TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Table name not configured." }),
    };
  }

  if (!playerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing playerId in path." }),
    };
  }

  try {
    const command = new QueryCommand({
      TableName: GAME_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `PLAYER#${playerId}` },
        ":skPrefix": { S: "ATTACK_TROOP#" },
      },
    });

    const result = await docClient.send(command);

    const attackTroops = (result.Items || []).map((item) => unmarshall(item));

    return {
      statusCode: 200,
      body: JSON.stringify(attackTroops),
    };
  } catch (error) {
    console.error("Error querying attack troops:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
