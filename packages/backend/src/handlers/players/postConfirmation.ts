import { PostConfirmationTriggerHandler } from "aws-lambda";
import { docClient } from "../../../../shared/src/lib/dynamoClient";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

// Environment Variable
const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME!;

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { userName, request } = event;
  const email = request.userAttributes.email;

  // Create player profile
  const playerProfile = {
    PK: `PLAYER#${userName}`,
    SK: "PROFILE#",
    email,
    gold: 1000, // Starting gold
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

  // Use a sanitized version of the email for logging
  console.log(`Player profile created for ${email.replace(/[\r\n]/g, "")}`);

  return event;
};
