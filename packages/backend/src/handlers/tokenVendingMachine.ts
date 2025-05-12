import {
  AuthClient,
  CredentialProvider,
  PermissionScopes,
  ExpiresIn,
  AllTopics,
} from "@gomomento/sdk";
import { APIGatewayProxyHandler } from "aws-lambda";
import { getMomentoApiKey } from "shared/src/lib/getAuthToken";
import { headers } from "src/services/headers";

const topicName = process.env.TOPIC_NAME;

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!topicName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "missing topicName" }),
    };
  }
  const credProvider = await getMomentoApiKey();
  const authClient = new AuthClient({
    credentialProvider: CredentialProvider.fromString(credProvider),
  });

  try {
    const tokenResp = await authClient.generateApiKey(
      PermissionScopes.topicPublishSubscribe({ name: topicName }, AllTopics),
      ExpiresIn.minutes(30) // Increase the expiration time
    );

    if ("apiKey" in tokenResp) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ token: tokenResp.apiKey }),
      };
    } else {
      console.error("Unexpected response format", tokenResp);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Unexpected response format" }),
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in handler:", error.message, error.stack);
    } else {
      console.error("Error in handler:", error);
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "failed to generate token" }),
    };
  }
};
