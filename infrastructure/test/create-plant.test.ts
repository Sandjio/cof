import { handler } from "backend/src/handlers/plants/createPlant";
import { APIGatewayProxyEvent } from "aws-lambda";
import { docClient } from "shared/src/lib/dynamoClient";

jest.mock("uuid", () => ({ v4: () => "mocked-uuid-1234" }));
jest.mock("../../packages/shared/src/lib/dynamoClient", () => ({
  docClient: { send: jest.fn() },
}));

describe("Create Plant Lambda Handler", () => {
  const mockPlayer = { playerId: "123", gold: 1000 };
  const mockEvent = (body: object): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "/plant",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: "",
  });

  beforeEach(() => {
    (docClient.send as jest.Mock).mockReset();
    process.env.GAME_TABLE_NAME = "TestTable";
  });

  test("returns 400 for missing required fields", async () => {
    const event = mockEvent({ name: "Test" });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Name, cost, and playerId are required.",
    });
  });

  test("returns 404 when player not found", async () => {
    (docClient.send as jest.Mock).mockResolvedValueOnce({ Item: null });
    const event = mockEvent({ name: "Test", cost: 100, playerId: "123" });

    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      message: "Player not found.",
    });
  });

  test("returns 400 for insufficient gold", async () => {
    (docClient.send as jest.Mock).mockResolvedValueOnce({
      Item: { ...mockPlayer, gold: 50 },
    });
    const event = mockEvent({ name: "Test", cost: 100, playerId: "123" });

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Not enough gold to buy this plant.",
    });
  });

  test("creates plant and updates gold successfully", async () => {
    (docClient.send as jest.Mock)
      .mockResolvedValueOnce({ Item: mockPlayer }) // Get player
      .mockResolvedValueOnce({}); // Create plant

    const event = mockEvent({
      name: "Oak",
      cost: 500,
      playerId: "123",
      type: "Tree",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.message).toBe("Plant purchased successfully!");
    expect(body.plant).toEqual({
      PK: "PLAYER#123",
      SK: "PLANT#mocked-uuid-1234",
      plantId: "mocked-uuid-1234",
      name: "Oak",
      type: "Tree",
      cost: 500,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(body.newGoldAmount).toBe(500);
  });

  test("returns 500 for DynamoDB errors", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    (docClient.send as jest.Mock).mockRejectedValue(new Error("DB Error"));
    const event = mockEvent({
      name: "Oak",
      cost: 500,
      playerId: "123",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to purchase plant.",
    });
  });
});
