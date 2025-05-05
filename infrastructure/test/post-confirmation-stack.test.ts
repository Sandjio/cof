import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as path from "path";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";

import { InfrastructureStack } from "../lib/infrastructure-stack";

describe("InfrastructureStack", () => {
  let stack: InfrastructureStack;

  beforeEach(() => {
    const app = new App();
    stack = new InfrastructureStack(app, "TestInfrastructureStack");

    // Mock Game Table
    const gameTable = new dynamodb.Table(stack, "GameTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Mock User Pool
    const userPool = new cognito.UserPool(stack, "TestUserPool");

    const postConfirmationFunction = new lambdaNodejs.NodejsFunction(
      stack,
      "TestPostConfirmation",
      {
        runtime: Runtime.NODEJS_18_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/players/postConfirmation.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantWriteData(postConfirmationFunction);

    postConfirmationFunction.addEnvironment(
      "GAME_TABLE_NAME",
      gameTable.tableName
    );

    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      postConfirmationFunction
    );
  });

  it("should create a Lambda function with correct properties", () => {
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

  it("should grant DynamoDB write permissions to the Lambda function", () => {
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
              "dynamodb:DeleteItem",
            ]),
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  it("should attach Lambda as PostConfirmation trigger to the User Pool", () => {
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: {
        PostConfirmation: {
          "Fn::GetAtt": Match.anyValue(),
        },
      },
    });
  });
});
