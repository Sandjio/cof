import {
  Duration,
  aws_lambda as lambda,
  aws_cognito as cognito,
  aws_lambda_nodejs as lambdaNodejs,
  aws_dynamodb as dynamodb,
  aws_apigateway as apigateway,
  aws_events as events,
  aws_events_targets as targets,
  aws_secretsmanager as secretsmanager,
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

    const momentoApiKeySecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "MomentoApiKeySecret",
      "arn:aws:secretsmanager:us-east-1:223325094309:secret:clash-of-farms/momento-api-key-hVVNf2"
    );
    // Create a Cognito User Pool
    const userPool = new cognito.UserPool(this, "ClashOfFarmsUserPool", {
      userPoolName: process.env.USER_POOL_NAME,
      selfSignUpEnabled: true, // Allow users to sign up
      autoVerify: { email: true }, // Automatically verify email
      signInAliases: { email: true }, // Allow sign-in with email
      standardAttributes: {
        preferredUsername: {
          required: true,
          mutable: false,
        },
      },

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
          callbackUrls: [
            process.env.CALLBACK_URL || "http://localhost:8080/auth/callback",
          ],
          logoutUrls: [
            process.env.LOGOUT_URL || "http://localhost:8080/logout",
          ],
        },
        enableTokenRevocation: true, // Enable token revocation
        preventUserExistenceErrors: true, // Prevent user existence errors
        accessTokenValidity: Duration.days(1),
        idTokenValidity: Duration.days(1),
        refreshTokenValidity: Duration.days(30),
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
          CACHE_NAME: process.env.CACHE_NAME!,
          SECRET_ARN: momentoApiKeySecret.secretArn,
        },
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantWriteData(postConfirmationFunction);

    momentoApiKeySecret.grantRead(postConfirmationFunction);

    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      postConfirmationFunction
    );

    // Token Vending Machine
    const tokenVendingMachineFunction = new lambdaNodejs.NodejsFunction(
      this,
      "TokenVendingMachine",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/tokenVendingMachine.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          TOPIC_NAME: process.env.TOPIC_NAME!,
          SECRET_ARN: momentoApiKeySecret.secretArn,
        },
      }
    );
    momentoApiKeySecret.grantRead(tokenVendingMachineFunction);

    // Get player Gold and Trophy
    const getPlayerProfileFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetPlayerProfileFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/players/getProfile.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
          CACHE_NAME: process.env.CACHE_NAME!,
          SECRET_ARN: momentoApiKeySecret.secretArn,
        },
      }
    );

    gameTable.grantReadData(getPlayerProfileFn);
    momentoApiKeySecret.grantRead(getPlayerProfileFn);

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
          CACHE_NAME: process.env.CACHE_NAME!,
          SECRET_ARN: momentoApiKeySecret.secretArn,
        },
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantReadWriteData(createPlantFunction);
    momentoApiKeySecret.grantRead(createPlantFunction);

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
          CACHE_NAME: process.env.CACHE_NAME!,
          SECRET_ARN: momentoApiKeySecret.secretArn,
        },
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
      }
    );

    gameTable.grantReadWriteData(createDefenseTroopFunction);
    momentoApiKeySecret.grantRead(createDefenseTroopFunction);

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

    // Create a Lambda function for creating a battle
    const startBattleFunction = new lambdaNodejs.NodejsFunction(
      this,
      "startBattleFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/startBattle.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        timeout: Duration.seconds(60),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
          SECRET_ARN: momentoApiKeySecret.secretArn,
          SECRET_NAME: "clash-of-farms/momento-api-key",
          CACHE_NAME: process.env.CACHE_NAME!,
          DEBUG: "true",
        },
      }
    );

    gameTable.grantReadWriteData(startBattleFunction);
    momentoApiKeySecret.grantRead(startBattleFunction);

    const getPlantsFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetPlantsFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/plants/getPlants.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadData(getPlantsFn);

    const getDefenseTroopsFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetDefenseTroopsFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/defense/getDefenseTroops.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadData(getDefenseTroopsFn);

    const createAttackTroopFn = new lambdaNodejs.NodejsFunction(
      this,
      "CreateAttackTroopFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/createAttackTroop.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
          SECRET_ARN: momentoApiKeySecret.secretArn,
          CACHE_NAME: process.env.CACHE_NAME!,
        },
      }
    );

    gameTable.grantReadWriteData(createAttackTroopFn);
    momentoApiKeySecret.grantRead(createAttackTroopFn);

    const getAttackTroopsFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetAttackTroopsFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/getAttackTroops.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadData(getAttackTroopsFn);

    const upgradeTroopFn = new lambdaNodejs.NodejsFunction(
      this,
      "UpgradeTroopFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/players/upgradeTroop.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadWriteData(upgradeTroopFn);

    const createAttackRecipeFn = new lambdaNodejs.NodejsFunction(
      this,
      "CreateAttackRecipeFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/createAttackRecipe.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );
    gameTable.grantWriteData(createAttackRecipeFn);

    const getAttackRecipesFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetAttackRecipesFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/getAttackRecipes.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadData(getAttackRecipesFn);

    const getBattleResultsFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetBattleResultFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: path.join(
          __dirname,
          "../..",
          "packages/backend/src/handlers/attack/getBattleResults.ts"
        ),
        bundling: {
          externalModules: ["aws-lambda"],
        },
        projectRoot: path.join(__dirname, "../.."),
        environment: {
          GAME_TABLE_NAME: gameTable.tableName,
        },
      }
    );

    gameTable.grantReadData(getBattleResultsFn);

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

    // EventBridge Rule for PlantSeeded event
    new events.Rule(this, "PlantSeedRule", {
      eventBus: bus,
      eventPattern: {
        source: ["event-router-service"],
        detailType: ["PlantSeeded"],
        detail: {
          eventType: ["PlantSeeded"],
          payload: {
            plantId: [{ exists: true }],
          },
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
        allowOrigins: ["http://localhost:8080"],
        allowMethods: apigateway.Cors.ALL_METHODS, // Allow all methods
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
          "X-Amz-Security-Token",
        ],
        allowCredentials: true,
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

    // Token Vending Machine Endpoint
    const token = api.root.addResource("tokens");
    token.addMethod(
      "GET",
      new apigateway.LambdaIntegration(tokenVendingMachineFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // get player profile endpoint
    const players = api.root.addResource("players");
    const playerProfile = players.addResource("{playerId}");
    playerProfile.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getPlayerProfileFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create Plant endpoint
    const plant = api.root.addResource("plants");
    plant.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createPlantFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Endpoint to get all plants owned by a player
    const gardens = api.root.addResource("gardens");
    const player = gardens.addResource("{playerId}");
    const playerPlants = player.addResource("plants");
    playerPlants.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getPlantsFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create Defense Troop endpoint
    const defenseTroop = api.root.addResource("defense-troops");
    defenseTroop.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createDefenseTroopFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Endpoint to get all defense troops owned by a player
    const playerDefenseTroops = player.addResource("defense-troops");
    playerDefenseTroops.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getDefenseTroopsFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create an Attack Troop endpoint
    const attackTroop = api.root.addResource("attack-troops");
    attackTroop.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createAttackTroopFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Get all attack troops owned by a player
    const playerAttackTroops = player.addResource("attack-troops");
    playerAttackTroops.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getAttackTroopsFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Upgrade a troop endpoint
    const troops = api.root.addResource("troops");
    const troopsId = troops.addResource("{troopId}");
    const upgradeTroop = troopsId.addResource("upgrade");
    upgradeTroop.addMethod(
      "PATCH",
      new apigateway.LambdaIntegration(upgradeTroopFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create an Attack recipe endpoint
    const attackRecipe = api.root.addResource("attack-recipes");
    attackRecipe.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createAttackRecipeFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Get all attack recipes owned by a player
    const playerAttackRecipes = player.addResource("attack-recipes");
    playerAttackRecipes.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getAttackRecipesFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Create Battle endpoint
    const battle = api.root.addResource("battles");
    battle.addMethod(
      "POST",
      new apigateway.LambdaIntegration(startBattleFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Get Battle results endpoint
    const battleResults = battle.addResource("{battleId}");
    battleResults.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getBattleResultsFn),
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
  }
}
