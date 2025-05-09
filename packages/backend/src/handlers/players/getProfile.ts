import { APIGatewayProxyHandler } from "aws-lambda";
import { docClient } from "shared/lib/dynamoClient";
import {
  CacheClient,
  Configurations,
  CredentialProvider,
  CacheDictionaryGetFieldsResponse,
} from "@gomomento/sdk";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { momentoTtl } from "shared/src/lib/defaultMomentoTtl";

const CACHE_NAME = process.env.CACHE_NAME!;
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const playerId = event.pathParameters?.playerId;
  const username = event.queryStringParameters?.username;

  if (!playerId || !username) {
    return {
      statusCode: 400,
      body: "Missing path parameter playerId and username in the body",
    };
  }

  // get Momento API key & client
  const apiKey = await getMomentoApiKey();
  const credProvider = CredentialProvider.fromString(apiKey);
  const cacheClient = new CacheClient({
    configuration: Configurations.Lambda.latest(),
    credentialProvider: credProvider,
    defaultTtlSeconds: momentoTtl,
  });

  try {
    // Try to fetch from the Cache
    const cacheResp = await cacheClient.dictionaryGetFields(
      CACHE_NAME,
      username,
      ["gold", "trophy"]
    );

    if (cacheResp.type === CacheDictionaryGetFieldsResponse.Hit) {
      return {
        statusCode: 200,
        body: JSON.stringify(Object.fromEntries(cacheResp.valueMap())),
      };
    }

    // On miss, read from dynamodb
    const getResult = await docClient.send(
      new GetCommand({
        TableName: GAME_TABLE_NAME,
        Key: { PK: `PLAYER#${playerId}`, SK: `PROFILE#` },
      })
    );
    console.log(
      `Here is the result item: ${JSON.stringify(getResult.Item, null, 2)}`
    );
    if (
      !getResult.Item ||
      !getResult.Item.gold === undefined ||
      !getResult.Item.trophy === undefined
    ) {
      return { statusCode: 404, body: "Not found or incomplete data" };
    }

    // Populate the catch for next time
    await cacheClient.dictionarySetFields(
      CACHE_NAME,
      username,
      new Map<string, string>([
        ["gold", getResult.Item.gold.toString()],
        ["trophy", getResult.Item.trophy.toString()],
      ])
    );

    return {
      statusCode: 200,
      body: JSON.stringify(getResult.Item),
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in handler:", error.message, error.stack);
    } else {
      console.error("Error in handler:", error);
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
