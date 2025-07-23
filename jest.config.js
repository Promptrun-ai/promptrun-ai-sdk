module.exports = {
  preset: "ts-jest",
  coverageProvider: "v8",
  testEnvironment: "node",
  collectCoverageFrom: ["src/**/*.ts"],
  roots: ["<rootDir>/tests"],
  detectOpenHandles: true,
  forceExit: true,
};
