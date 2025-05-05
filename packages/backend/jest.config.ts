// packages/backend/jest.config.ts
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".", // relative to this config file
  moduleNameMapper: {
    "^shared/src/(.*)$": "<rootDir>/../shared/src/$1",
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/*.test.ts"],
};

export default config;
