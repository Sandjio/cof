import { handler } from "../handlers/defense/getDefenseTroops";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { docClient } from "shared/src/lib/dynamoClient";

const ddbMock = mockClient(docClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.GAME_TABLE_NAME = "MockGameTable";
});

test("should return a list of defense troops for a valid playerId", async () => {
  ddbMock.on(QueryCommand).resolves({
    Items: [
      {
        PK: { S: "USER#player123" },
        SK: { S: "DEFENSE_TROOP#123" },
        name: { S: "Archer" },
        type: { S: "Troop" },
      },
      {
        PK: { S: "USER#player123" },
        SK: { S: "DEFENSE_TROOP#456" },
        name: { S: "Giant" },
        type: { S: "Troop" },
      },
    ],
  });

  const mockContext = {} as any;
  const mockCallback = jest.fn();
  const response = await handler(
    {
      pathParameters: { playerId: "player123" },
    } as any,
    mockContext,
    mockCallback
  );

  expect(
    response && "statusCode" in response ? response.statusCode : undefined
  ).toBe(200);
  if (!response || !("body" in response)) {
    throw new Error("Invalid response from handler");
  }
  const body = JSON.parse(response.body);
  expect(body).toHaveLength(2);
  expect(body[0].name).toBe("Archer");
});

test("should return 400 if playerId is missing", async () => {
  const mockContext = {} as any;
  const mockCallback = jest.fn();
  const response = await handler(
    {
      pathParameters: {},
    } as any,
    mockContext,
    mockCallback
  );

  expect(
    response && "statusCode" in response ? response.statusCode : undefined
  ).toBe(400);
  if (!response || !("body" in response)) {
    throw new Error("Invalid response from handler");
  }
  expect(JSON.parse(response.body).message).toMatch(/missing/i);
});

test("should return 500 on DynamoDB error", async () => {
  ddbMock.on(QueryCommand).rejects(new Error("DynamoDB failure"));

  const mockContext = {} as any;
  const mockCallback = jest.fn();
  const response = await handler(
    {
      pathParameters: { playerId: "player123" },
    } as any,
    mockContext,
    mockCallback
  );

  expect(
    response && "statusCode" in response ? response.statusCode : undefined
  ).toBe(500);
  if (!response || !("body" in response)) {
    throw new Error("Invalid response from handler");
  }
  expect(JSON.parse(response.body).message).toMatch(/internal/i);
});
