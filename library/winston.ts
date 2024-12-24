import originalLog from "loglevel";
import { LoggingWinston } from "@google-cloud/logging-winston";
import winston from "winston";

// Create Winston transport for Google Cloud Logging
const cloudLogging = new LoggingWinston();

// Create Winston logger
const winstonLogger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console(), cloudLogging],
  format: winston.format.json(),
});

// Custom formatter for loglevel
const originalFactory = originalLog.methodFactory;
originalLog.methodFactory = function (methodName, logLevel, loggerName) {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);

  return function (message: any, ...args: any[]) {
    rawMethod(message, ...args);

    const levelMap: Record<string, string> = {
      trace: "debug",
      debug: "debug",
      info: "info",
      warn: "warn",
      error: "error",
    };

    const winstonLevel = levelMap[methodName] || "info";
    winstonLogger.log({
      level: winstonLevel,
      message: typeof message === "string" ? message : JSON.stringify(message),
      ...args,
    });
  };
};

// Apply the changes
originalLog.setLevel(originalLog.getLevel());

export default originalLog;
