#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "../lib/infrastructure-stack";

const app = new cdk.App();

let stageName = app.node.tryGetContext("stageName");
let ssmStageName = app.node.tryGetContext("ssmStageName");

if (!stageName) {
  console.log("Defaulting to dev stage");
  stageName = "dev";
}

if (!ssmStageName) {
  console.log(`Defaulting SSM stage name to "stageName":${stageName}`);
  ssmStageName = stageName;
}

try {
  new InfrastructureStack(app, `InfrastructureStack-${stageName}`, {});
} catch (error) {
  console.error("Error creating InfrastructureStack:", error);
  process.exit(1);
}
