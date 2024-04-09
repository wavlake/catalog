const dotenv = require("dotenv");

dotenv.config({
  path: "./.env",
});

module.exports = {
  setupFiles: ["<rootDir>/.jest/setEnvVars.ts"],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
};
