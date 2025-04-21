import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a Cognito User Pool
    const userPool = new cognito.UserPool(this, "ClashOfFarmsUserPool", {
      userPoolName: "ClashOfFarmsUserPool",
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
        userPoolClientName: "ClashOfFarmsWebClient",
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
          callbackUrls: ["http://localhost:3000/"],
          logoutUrls: ["http://localhost:3000/logout"],
        },
      }
    );

    // Output the User Pool ID and Client ID for use in the frontend
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
    });
  }
}
