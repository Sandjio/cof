import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { safeLog } from "./safeLogs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../..", ".env") });

const AWS_REGION = process.env.AWS_REGION;
const secretArn = process.env.SECRET_ARN;

/**
 * Retrieves the Momento API key from AWS Secrets Manager
 */
export const getMomentoApiKey = async (): Promise<string> => {
  if (!secretArn) {
    safeLog(
      `SECRET_ARN environment variable not set. Environment vars:`,
      process.env
    );
    throw new Error("SECRET_ARN environment variable is not defined");
  }

  safeLog(`Retrieving secret from ARN: ${secretArn}`);
  const secretsManagerClient = new SecretsManagerClient({
    region: AWS_REGION || "us-east-1",
  });

  try {
    const secretValueCommand = new GetSecretValueCommand({
      SecretId: secretArn,
    });

    safeLog(`Sending GetSecretValue request for ARN: ${secretArn}`);
    const secretResponse = await secretsManagerClient.send(secretValueCommand);

    safeLog(`Received response from Secrets Manager`);

    if (!secretResponse.SecretString) {
      safeLog(`Secret value is empty or undefined. Response:`, {
        hasSecretString: !!secretResponse.SecretString,
      });
      throw new Error("Secret value is empty or undefined");
    }

    // For debugging only: Check format without exposing the actual value
    safeLog(
      `Secret format check: length=${
        secretResponse.SecretString.length
      }, type=${typeof secretResponse.SecretString}`
    );

    // Check if the secret is JSON
    try {
      // Try to parse as JSON
      const secretObject = JSON.parse(secretResponse.SecretString);
      safeLog(
        `Secret parsed as JSON. Available keys:`,
        Object.keys(secretObject)
      );

      // Check for common API key fields
      if (secretObject.apiKey) {
        safeLog(`Using 'apiKey' field from secret JSON`);
        return secretObject.apiKey;
      } else if (secretObject.token) {
        safeLog(`Using 'token' field from secret JSON`);
        return secretObject.token;
      } else if (secretObject.key) {
        safeLog(`Using 'key' field from secret JSON`);
        return secretObject.key;
      } else if (secretObject.value) {
        safeLog(`Using 'value' field from secret JSON`);
        return secretObject.value;
      } else if (secretObject.momento_api_key) {
        safeLog(`Using 'momento_api_key' field from secret JSON`);
        return secretObject.momento_api_key;
      } else if (secretObject.momentoApiKey) {
        safeLog(`Using 'momentoApiKey' field from secret JSON`);
        return secretObject.momentoApiKey;
      } else if (secretObject.MOMENTO_API_KEY) {
        // Added this field check
        safeLog(`Using 'MOMENTO_API_KEY' field from secret JSON`);
        return secretObject.MOMENTO_API_KEY;
      } else {
        // If we don't find a specific key, log available keys and use the whole string
        safeLog(`No recognized API key field found in JSON. Using raw string.`);
        return secretResponse.SecretString;
      }
    } catch (jsonError) {
      // Not valid JSON, use as a plain string
      safeLog(`Secret is not valid JSON, using as plain string`);
      return secretResponse.SecretString;
    }
  } catch (error) {
    safeLog(`Error retrieving Momento API key from Secrets Manager:`, error);
    if (error instanceof Error) {
      throw new Error(`Failed to retrieve Momento API key: ${error.message}`);
    } else {
      throw new Error("Failed to retrieve Momento API key: Unknown error");
    }
  }
};
