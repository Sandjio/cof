import {
  Duration,
  aws_lambda as lambda,
  aws_cognito as cognito,
  aws_lambda_nodejs as lambdaNodejs,
  aws_dynamodb as dynamodb,
  aws_apigateway as apigateway,
  aws_events as events,
  aws_events_targets as targets,
} from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import * as dotenv from "dotenv";

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

    userPool.addDomain("ClashOfFarmsDomain", {
      cognitoDomain: {
        domainPrefix:
          process.env.USER_POOL_DOMAIN_PREFIX || "clashoffarms-auth",
      },
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
        enableTokenRevocation: true, // Enable token revocation
        preventUserExistenceErrors: true, // Prevent user existence errors
      }
    );

    // Create a DynamoDB table for game data
    const gameTable = new dynamodb.Table(this, "gameTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: process.env.GAME_TABLE_NAME,
    });

    // Create a Lambda function for post-confirmation trigger
    // This function will be triggered after a user confirms their account
    // and will create a player profile in the DynamoDB table
    const postConfirmationFunction = new lambdaNodejs.NodejsFunction(
      this,
      "PostConfirmation",
      {
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/players/postConfirmation.ts"
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
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

    // Create a Lambda function for creating a plant
    const createPlantFunction = new lambdaNodejs.NodejsFunction(
      this,
      "CreatePlantFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
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

    gameTable.grantReadWriteData(createPlantFunction);

    // Create a Lambda function for creating a defense troop
    const createDefenseTroopFunction = new lambdaNodejs.NodejsFunction(
      this,
      "CreateDefenseTroopFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/defense/createDefenseTroop.ts"
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
    gameTable.grantReadWriteData(createDefenseTroopFunction);

    // Create a Lambda function for planting a seed
    const plantSeedFn = new lambdaNodejs.NodejsFunction(
      this,
      "PlantSeedHandler",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/plants/plantSeedEvent.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        timeout: Duration.seconds(30),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadWriteData(plantSeedFn);

    // EventBridge Bus
    const bus = new events.EventBus(this, "GameEventBus", {
      eventBusName: "clash-of-farms-bus",
    });
    new events.Archive(this, "GameEventBusArchive", {
      sourceEventBus: bus,
      archiveName: "GameEventsArchive",
      description: "Archive for game-related events",
      retention: Duration.days(7), // Archive events for 7 days
      eventPattern: {
        source: ["event-router-service"],
      },
    });
    // EventBridge Rule for plant.seed
    new events.Rule(this, "PlantSeedRule", {
      eventBus: bus,
      eventPattern: {
        source: ["event-router-service"],
        detailType: ["MomentoMessage"],
        detail: {
          type: ["plant.seed"],
        },
      },
      targets: [new targets.LambdaFunction(plantSeedFn)],
    });

    // Grant the EventBridge bus permission to invoke the Lambda function
    bus.grantPutEventsTo(plantSeedFn);

    // Create a Rest API Gateway
    const api = new apigateway.RestApi(this, "ClashOfFarmsApi", {
      restApiName: "Clash Of Farms Api",
      description: "API for Clash of Farms game",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Allow all origins for development
        allowMethods: apigateway.Cors.ALL_METHODS, // Allow all methods
        allowHeaders: ["Content-Type", "Authorization"], // Allow specific headers
      },
      deployOptions: {
        stageName: "dev",
      },
    });
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "ClashOfFarmsAuthorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    const plant = api.root.addResource("plant");

    plant.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createPlantFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    const defenseTroop = api.root.addResource("defense-troop");
    defenseTroop.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createDefenseTroopFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Output the Cognito Hosted UI URL
    new cdk.CfnOutput(this, "CognitoHostedUiUrl", {
      value: `https://${
        process.env.USER_POOL_DOMAIN_PREFIX || "clashoffarms-auth"
      }.auth.${
        this.region
      }.amazoncognito.com/login?response_type=code&client_id=${
        userPoolClient.userPoolClientId
      }&redirect_uri=${process.env.CALLBACK_URL || "http://localhost:3000/"}`,
      description: "Cognito Hosted UI Login URL",
    });
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
    // new cdk.CfnOutput(this, "ApiEndpoint", {
    //   value: api.url,
    //   description: "API Endpoint",
    // });
  }
}
