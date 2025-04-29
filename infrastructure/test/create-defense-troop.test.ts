import { handler } from "../../packages/backend/src/handlers/defense/createDefenseTroop";
import { APIGatewayProxyEvent } from "aws-lambda";
import { docClient } from "../../packages/shared/src/lib/dynamoClient";

jest.mock("uuid", () => ({ v4: () => "mocked-uuid-1234" }));
jest.mock("../../packages/shared/src/lib/dynamoClient", () => ({
  docClient: { send: jest.fn() },
}));

describe("Create a Defense Troop Lambda Handler", () => {
  const mockPlayer = { playerId: "123", gold: 1000 };
  const mockEvent = (body: object): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "defense-troop",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: "",
  });
  beforeEach(() => {
    (docClient.send as jest.Mock).mockReset();
    process.env.PLAYERS_TABLE_NAME = "PlayersTable";
    process.env.DEFENSE_TABLE_NAME = "DefenseTable";
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
      message: "Not enough gold to buy this Defense Troop.",
    });
  });

  test("creates a defense troop and update gold successfully", async () => {
    (docClient.send as jest.Mock)
      .mockResolvedValueOnce({ Item: mockPlayer }) // Get player
      .mockResolvedValueOnce({}) // Create Defense Troop
      .mockResolvedValueOnce({}); // Update gold

    const event = mockEvent({
      name: "Test",
      cost: 100,
      playerId: "123",
      type: "archer",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.message).toBe("Defense Troop created successfully.");
    expect(body.defenseTroop).toEqual({
      defenseTroopId: "mocked-uuid-1234",
      playerId: "123",
      name: "Test",
      type: "archer",
      cost: 100,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(body.newGoldAmount).toBe(900);
  });

  test("handles errors gracefully", async () => {
    (docClient.send as jest.Mock).mockRejectedValue(new Error("DB Error"));
    const event = mockEvent({
      name: "Test",
      cost: 100,
      playerId: "123",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to create defense troop.",
    });
  });

  test("returns 500 for DynamoDB errors", async () => {
    (docClient.send as jest.Mock).mockRejectedValue(new Error("DB Error"));
    const event = mockEvent({
      name: "Test",
      cost: 100,
      playerId: "123",
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to create defense troop.",
    });
  });
});
