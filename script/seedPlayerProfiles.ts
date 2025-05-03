import { PutItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import * as dotenv from "dotenv";
import * as path from "path";

// import { docClient } from "shared/src/lib/dynamoClient";

dotenv.config({ path: path.join(__dirname, "../", ".env") });

const GAME_TABLE_NAME = process.env.GAME_TABLE_NAME;
const docClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
});
const seedUserProfiles = async () => {
  const users = Array.from({ length: 20 }, (_, index) => ({
    PK: { S: `PLAYER#${uuidv4()}` },
    SK: { S: "PROFILE#" },
    email: { S: `user${index + 1}@example.com` },
    gold: { N: `${Math.floor(Math.random() * 1000) + 1}` }, // Random gold between 1 and 1000
    createdAt: { S: new Date().toISOString() },
    updatedAt: { S: new Date().toISOString() },
  }));

  for (const user of users) {
    try {
      const command = new PutItemCommand({
        TableName: GAME_TABLE_NAME,
        Item: user,
      });
      await docClient.send(command);
      console.log(`Seeded user: ${user.PK.S}`);
    } catch (error) {
      console.error(`Failed to seed user: ${user.PK.S}`, error);
    }
  }

  console.log("Seeding completed.");
};

seedUserProfiles().catch((error) => {
  console.error("Error seeding user profiles:", error);
});
