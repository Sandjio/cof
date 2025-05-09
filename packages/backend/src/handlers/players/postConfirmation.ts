import { PostConfirmationTriggerHandler } from "aws-lambda";
import { docClient } from "../../../../shared/src/lib/dynamoClient";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CacheClient,
  CredentialProvider,
  Configurations,
} from "@gomomento/sdk";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";

// Environment Variable
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;
const CACHE_NAME = process.env.CACHE_NAME!;

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { userName, request } = event;
  const preferredUsername = request.userAttributes.preferred_username;

  // Create player profile
  const playerProfile = {
    PK: `PLAYER#${userName}`,
    SK: "PROFILE#",
    preferredUsername,
    gold: 1000,
    trophy: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: GAME_TABLE_NAME,
      Item: playerProfile,
      ConditionExpression: "attribute_not_exists(PK)", // Prevent overwriting
    })
  );

  const apiKey = await getMomentoApiKey();
  const credProvider = CredentialProvider.fromString(apiKey);
  const client = new CacheClient({
    configuration: Configurations.Lambda.latest(),
    credentialProvider: credProvider,
    defaultTtlSeconds: 60 * 60 * 24,
  });

  const result = await client.dictionarySetFields(
    CACHE_NAME,
    preferredUsername,
    new Map<string, string>([
      ["gold", playerProfile.gold.toString()],
      ["trophy", playerProfile.trophy.toString()],
    ])
  );

  if (!result) {
    console.log("Cache Client send");
  }

  console.log(`Player profile created for ${preferredUsername}`);

  return event;
};
