
module.exports = {
  testEnvironment: "node",

  testMatch: [
    "<rootDir>/tests/**/*.test.js"
  ],

  collectCoverageFrom: [
    "controllers/appointmentController.js"
  ],

  coverageDirectory: "coverage",

  coverageReporters: [
    "text",
    "lcov",
    "html"
  ],

  clearMocks: true
};
