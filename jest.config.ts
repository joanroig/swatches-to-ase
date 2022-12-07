/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["jest-extended/all"],
  coveragePathIgnorePatterns: ["<rootDir>/src/test/"],
  testTimeout: 20000,
  runner: "groups",
  coverageReporters: ["json-summary"],
};
