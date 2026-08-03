/** @type {import('ts-jest').JestConfigWithTsJest} */
const base = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  clearMocks: true,
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: "unit",
      // Mockean Prisma: corren en cualquier lado, sin base.
      roots: ["<rootDir>/src", "<rootDir>/tests/unit"],
    },
    {
      ...base,
      displayName: "integration",
      // Exigen Postgres con realestate_test migrada (scripts/test-db.ps1).
      roots: ["<rootDir>/tests/integration"],
      setupFilesAfterEnv: ["<rootDir>/tests/integration/setup-db.ts"],
    },
  ],
};
