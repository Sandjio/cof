import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import * as dotenv from "dotenv";
import * as aws_apigateway from "aws-cdk-lib/aws-apigateway";

dotenv.config({ path: path.join(__dirname, "../..", ".env") });

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Check if USER_POOL_NAME environment variable is set
    if (!process.env.USER_POOL_NAME) {
      throw new Error("USER_POOL_NAME environment variable is not set");
    }
    if (!process.env.GAME_TABLE_NAME) {
      throw new Error("GAME_TABLE_NAME environment variable is not set");
    }
    if (!process.env.USER_POOL_CLIENT_NAME) {
      throw new Error("USER_POOL_CLIENT_NAME environment variable is not set");
    }

    // Create a Cognito User Pool
    const userPool = new cognito.UserPool(this, "ClashOfFarmsUserPool", {
      userPoolName: process.env.USER_POOL_NAME,
      selfSignUpEnabled: true, // Allow users to sign up
      autoVerify: { email: true }, // Automatically verify email
      signInAliases: { email: true }, // Allow sign-in with email
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // Recover account via email
    });

    // Create a User Pool Client for the web application
    const userPoolClient = new cognito.UserPoolClient(
      this,
      "ClashOfFarmsUserPoolClient",
      {
        userPool,
        userPoolClientName: process.env.USER_POOL_CLIENT_NAME,
        authFlows: {
          userPassword: true, // Enable USER_PASSWORD_AUTH for email/password login
          userSrp: true, // Enable Secure Remote Password (SRP) for secure authentication
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true, // Enable Authorization Code Grant for web apps
          },
          scopes: [
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.PROFILE,
          ], // OAuth scopes
          callbackUrls: [process.env.CALLBACK_URL || "http://localhost:3000/"],
          logoutUrls: [
            process.env.LOGOUT_URL || "http://localhost:3000/logout",
          ],
        },
      }
    );

    const gameTable = new dynamodb.Table(this, "gameTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: process.env.GAME_TABLE_NAME,
    });

    const postConfirmationFunction = new lambdaNodejs.NodejsFunction(
      this,
      "PostConfirmation",
      {
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/players/postConfirmation.ts"
        ),
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "handler",
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantWriteData(postConfirmationFunction);

    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      postConfirmationFunction
    );

    const createPlantFunction = new lambdaNodejs.NodejsFunction(
      this,
      "CreatePlantFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/plants/createPlant.ts"
        ),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantWriteData(createPlantFunction);

    // Create a Rest API Gateway
    const api = new aws_apigateway.RestApi(this, "ClashOfFarmsApi", {
      restApiName: "Clash Of Farms Api",
      description: "API for Clash of Farms game",
      defaultCorsPreflightOptions: {
        allowOrigins: aws_apigateway.Cors.ALL_ORIGINS, // Allow all origins for development
        allowMethods: aws_apigateway.Cors.ALL_METHODS, // Allow all methods
        allowHeaders: ["Content-Type", "Authorization"], // Allow specific headers
      },
      deployOptions: {
        stageName: "dev",
      },
    });
    const authorizer = new aws_apigateway.CognitoUserPoolsAuthorizer(
      this,
      "ClashOfFarmsAuthorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    const plant = api.root.addResource("plant");

    plant.addMethod(
      "POST",
      new aws_apigateway.LambdaIntegration(createPlantFunction),
      {
        authorizer,
        authorizationType: aws_apigateway.AuthorizationType.COGNITO,
      }
    );

    // Output the User Pool ID
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });
    //Output the Client ID
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
    });
    // Output the API url
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url,
      description: "API Endpoint",
    });
  }
}
