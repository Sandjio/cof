import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { docClient } from "shared/lib/dynamoClient";
import { PlantSeededEvent } from "shared/src/events/plantEvent";
import { EventBridgeEvent } from "aws-lambda";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;

export const handler = async (
  event: EventBridgeEvent<"PlantSeeded", PlantSeededEvent>
) => {
  const { playerId, payload } = event.detail;
  const plantId = payload.plantId;

  const pk = `PLAYER#${playerId}`;
  const sk = `PLANT#${plantId}`;

  try {
    // Fetch the plant from DynamoDB
    const getResult = await docClient.send(
      new GetItemCommand({
        TableName: GAME_TABLE_NAME,
        Key: {
          PK: { S: pk },
          SK: { S: sk },
        },
      })
    );

    if (!getResult.Item) {
      console.warn(`Plant ${plantId} for player ${playerId} not found.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Plant not found" }),
      };
    }

    // Update the plant with growth = seed
    await docClient.send(
      new UpdateItemCommand({
        TableName: GAME_TABLE_NAME,
        Key: {
          PK: { S: pk },
          SK: { S: sk },
        },
        UpdateExpression: "SET growth = :growth",
        ExpressionAttributeValues: {
          ":growth": { S: "seed" },
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Plant growth set to 'seed'" }),
    };
  } catch (error) {
    console.error("Error updating plant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error seeding plant" }),
    };
  }
};
