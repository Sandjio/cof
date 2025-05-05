import { App } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "../lib/infrastructure-stack";
import { Template, Match } from "aws-cdk-lib/assertions";
import { State } from "aws-cdk-lib/aws-stepfunctions";

describe("CDK Stack", () => {
  let stack: InfrastructureStack;

  beforeEach(() => {
    // Initialize CDK Stack
    const app = new App();
    stack = new InfrastructureStack(app, "TestInfrastructureStack");

    // Deploy the stack into the test environment
    new InfrastructureStack(stack, "MyTestStack");
  });

  it("should create a DynamoDB table", () => {
    // Assert that the stack contains a DynamoDB Table resource
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "GameTable",
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
    });
  });

  it("should create a Lambda function", () => {
    // Assert that the stack contains a Lambda function resource
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Environment: {
        Variables: {
          GAME_TABLE_NAME: Match.objectLike({ Ref: Match.anyValue() }),
        },
      },
    });
  });

  it("should create an EventBridge Event Bus", () => {
    // Assert that the stack contains an EventBridge event bus
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Events::EventBus", {
      Name: "clash-of-farms-bus",
    });
  });

  it("should create an EventBridge Rule with Lambda target", () => {
    // Assert that the stack contains an EventBridge Rule
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Events::Rule", {
      EventBusName: Match.anyValue(),
      State: "ENABLED",
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.objectLike({
            "Fn::GetAtt": Match.arrayWith([
              Match.stringLikeRegexp("PlantSeedHandler"),
              "Arn",
            ]),
          }),
          Id: "Target0",
        }),
      ]),
    });
  });
});
