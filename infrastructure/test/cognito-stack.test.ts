import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { InfrastructureStack } from "../lib/infrastructure-stack";

describe("InfrastructureStack", () => {
  let template: Template;

  beforeAll(() => {
    // Initialize the CDK app and stack
    const app = new App();
    const stack = new InfrastructureStack(app, "TestInfrastructureStack");
    // Synthesize the stack to a CloudFormation template
    template = Template.fromStack(stack);
  });

  // Test User Pool configuration
  describe("User Pool", () => {
    it("should create a User Pool with the correct name", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UserPoolName: "ClashOfFarmsUserPool",
      });
    });

    it("should enable self sign-up", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: false,
        },
      });
    });

    it("should auto-verify email", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AutoVerifiedAttributes: ["email"],
      });
    });

    it("should allow sign-in with email", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UsernameAttributes: ["email"],
      });
    });

    it("should enforce a strong password policy", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
      });
    });

    it("should set email as the account recovery mechanism", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AccountRecoverySetting: {
          RecoveryMechanisms: [
            {
              Name: "verified_email",
              Priority: 1,
            },
          ],
        },
      });
    });
  });

  // Test User Pool Client configuration
  describe("User Pool Client", () => {
    it("should create a User Pool Client with the correct name", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        ClientName: "ClashOfFarmsWebClient",
      });
    });

    it("should enable USER_SRP_AUTH and USER_PASSWORD_AUTH flows", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        AllowedOAuthFlows: ["code"],
        ExplicitAuthFlows: Match.arrayWith([
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_USER_SRP_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ]),
      });
    });

    it("should configure OAuth scopes", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        AllowedOAuthScopes: ["email", "openid", "profile"],
      });
    });

    it("should set the correct callback and logout URLs", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        CallbackURLs: ["http://localhost:3000/"],
        LogoutURLs: ["http://localhost:3000/logout"],
      });
    });

    it("should enable Authorization Code Grant flow", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        AllowedOAuthFlows: ["code"],
      });
    });
  });

  // Test stack outputs
  describe("Stack Outputs", () => {
    it("should output the User Pool ID", () => {
      template.hasOutput("UserPoolId", {
        Description: "Cognito User Pool ID",
      });
    });

    it("should output the User Pool Client ID", () => {
      template.hasOutput("UserPoolClientId", {
        Description: "Cognito User Pool Client ID",
      });
    });
  });
});
