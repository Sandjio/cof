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

const CACHE_NAME = process.env.CACHE_NAME!;
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const playerId = event.pathParameters?.playerId;
  if (!playerId) {
    return { statusCode: 400, body: "Missing path parameter username" };
  }
  const body = JSON.parse(event.body || "{}");

  const { username } = body;

  const apiKey = await getMomentoApiKey();
  const credProvider = CredentialProvider.fromString(apiKey);

  const cacheClient = new CacheClient({
    configuration: Configurations.Lambda.latest(),
    credentialProvider: credProvider,
    defaultTtlSeconds: 60,
  });

  const cacheResp = await cacheClient.dictionaryGetFields(
    CACHE_NAME,
    username,
    ["gold", "trophy"]
  );
  switch (cacheResp.type) {
    case CacheDictionaryGetFieldsResponse.Hit:
      return { statusCode: 200, body: JSON.stringify(cacheResp.valueMap()) };

    case CacheDictionaryGetFieldsResponse.Miss:
      const getResult = await docClient.send(
        new GetCommand({
          TableName: GAME_TABLE_NAME,
          Key: { PK: `PLAYER#${playerId}`, SK: `PROFILE#` },
        })
      );
      if (!getResult.Item) {
        return { statusCode: 404, body: "Not found" };
      }

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
  }

  return { statusCode: 500, body: "Internal Server Error" };
};
