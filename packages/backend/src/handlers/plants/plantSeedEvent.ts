import {
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { docClient } from "shared/lib/dynamoClient";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
export const handler = async (event: any) => {
  try {
    const detail =
      typeof event.detail === "string"
        ? JSON.parse(event.detail)
        : event.detail;
    const playerId = detail.playerId;
    const plantId = detail.plantId;

    const pk = `PLAYER#${playerId}`;
    const sk = `PLANT#${plantId}`;

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
      console.error("Plant not found");
      return {
        statusCode: 404,
        body: "Plant not found",
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
        UpdateExpression: "SET #growth = :growthVal",
        ExpressionAttributeNames: {
          "#growth": "growth",
        },
        ExpressionAttributeValues: {
          ":growthVal": { S: "seed" },
        },
      })
    );

    return {
      statusCode: 200,
      body: "Plant growth initialized to seed",
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "Error seeding plant",
    };
  }
};
