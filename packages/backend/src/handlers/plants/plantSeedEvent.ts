import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PlantSeededEvent } from "shared/src/events/plantEvent";
import { EventBridgeEvent } from "aws-lambda";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
} from "@gomomento/sdk";
import { docClient } from "shared/lib/dynamoClient";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { momentoTtl } from "shared/src/lib/defaultMomentoTtl";

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
const CACHE_NAME = process.env.CACHE_NAME!;

export const handler = async (
  event: EventBridgeEvent<"PlantSeeded", PlantSeededEvent>
) => {
  const { playerId, payload } = event.detail;
  const { plantId, plantName, xCoordinate, yCoordinate } = payload;

  const plantPK = `PLAYER#${playerId}`;
  const plantSK = `PLANT#${plantName}`;
  const profileSK = `PROFILE#`;

  try {
    // 1) Read the plant to locate which coordinate entry to update
    const getResult = await docClient.send(
      new GetCommand({
        TableName: GAME_TABLE_NAME,
        Key: {
          PK: plantPK,
          SK: plantSK,
        },
        ProjectionExpression: "Coordinates",
      })
    );

    // 2) Grab the player’s PreferredUsername from their profile record:
    const profileGet = await docClient.send(
      new GetCommand({
        TableName: GAME_TABLE_NAME,
        Key: { PK: plantPK, SK: profileSK },
        ProjectionExpression: "PreferredUsername",
      })
    );

    if (!getResult.Item) {
      console.warn(`Plant ${plantName} for player ${playerId} not found.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Plant not found" }),
      };
    }

    const coords: Array<{ id: string }> = getResult.Item.Coordinates;
    const idx = coords.findIndex((c) => c.id === plantId);
    if (idx < 0) {
      console.warn(`Coord entry ${plantId} not found for plant ${plantId}.`);
      return { statusCode: 400, body: "Coordinate entry not found" };
    }

    // 3) Transactionally update the plant’s coordinate and bump Experience
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: GAME_TABLE_NAME,
              Key: {
                PK: plantPK,
                SK: plantSK,
              },
              UpdateExpression: `SET Coordinates[${idx}].xCoordinate = :x, Coordinates[${idx}].yCoordinate = :y`,
              ExpressionAttributeValues: {
                ":x": xCoordinate,
                ":y": yCoordinate,
              },
            },
          },
          {
            Update: {
              TableName: GAME_TABLE_NAME,
              Key: {
                PK: plantPK,
                SK: profileSK,
              },
              UpdateExpression:
                "SET Experience = if_not_exists(Experience, :zero) + :inc",
              ExpressionAttributeValues: {
                ":inc": 1,
                ":zero": 0,
              },
            },
          },
        ],
      })
    );

    // 4) Increment experience in cache
    const apiKey = await getMomentoApiKey();
    const cache = new CacheClient({
      configuration: Configurations.Lambda.latest(),
      credentialProvider: CredentialProvider.fromString(apiKey),
      defaultTtlSeconds: momentoTtl,
    });
    const userKey = profileGet.Item?.PreferredUsername as string;
    const momento_res = await cache.dictionaryIncrement(
      CACHE_NAME,
      userKey,
      "Experience",
      1
    );
    const coordEntry = {
      id: plantId,
      xCoordinate,
      yCoordinate,
    };
    const coordsListKey = `${userKey}#${plantName}#coords`;
    console.log(`Here is the Momento Response: ${momento_res}`);
    await cache.dictionarySetField(
      CACHE_NAME,
      coordsListKey,
      coordEntry.id,
      JSON.stringify(coordEntry)
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Plant coordinates updated and experience awarded!",
      }),
    };
  } catch (error) {
    console.error("Error in PlantSeeded handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
