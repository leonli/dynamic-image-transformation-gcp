module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.spec.ts"],
  setupFiles: ["<rootDir>/test/set-jest-environment-variables.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"],
  coverageThreshold: {
    global: { lines: 80, statements: 80 }
  },
  // GCP client libraries are mocked per-suite; keep workers modest for sharp
  maxWorkers: "50%"
};
