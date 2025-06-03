// Simple structured logger for Cloud Run - no dependencies needed!

type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

interface LogEntry {
  severity: string;
  message: string;
  timestamp: string;
  labels?: Record<string, string>;
  [key: string]: any;
}

// Map log levels to Google Cloud Logging severities
const severityMap: Record<LogLevel, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

// Get Cloud Run metadata
const serviceMetadata = {
  service: process.env.K_SERVICE || "unknown-service",
  revision: process.env.K_REVISION || "unknown-revision",
  configuration: process.env.K_CONFIGURATION || "unknown-configuration",
};

// Current log level from environment
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
const logLevelPriority: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

class SimpleLogger {
  private shouldLog(level: LogLevel): boolean {
    return logLevelPriority[level] >= logLevelPriority[LOG_LEVEL];
  }

  private log(level: LogLevel, message: any, ...args: any[]) {
    if (!this.shouldLog(level)) return;

    // For development, use console methods
    if (process.env.NODE_ENV === "development") {
      console[level === "trace" ? "debug" : level](message, ...args);
      return;
    }

    // Build structured log entry
    const logEntry: LogEntry = {
      severity: severityMap[level],
      message: typeof message === "string" ? message : JSON.stringify(message),
      timestamp: new Date().toISOString(),
      labels: serviceMetadata,
    };

    // Handle additional arguments
    if (args.length > 0) {
      if (args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
        // Merge object arguments
        Object.assign(logEntry, args[0]);
        if (args.length > 1) {
          logEntry.additionalArgs = args.slice(1);
        }
      } else {
        logEntry.additionalArgs = args;
      }
    }

    // Handle errors specially
    if (message instanceof Error) {
      logEntry.message = message.message;
      logEntry.error = {
        message: message.message,
        stack: message.stack,
        name: message.name,
      };
    } else if (args[0] instanceof Error) {
      logEntry.error = {
        message: args[0].message,
        stack: args[0].stack,
        name: args[0].name,
      };
    }

    // Output to stdout/stderr
    const output = JSON.stringify(logEntry);
    if (level === "error" || level === "warn") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  trace(message: any, ...args: any[]) {
    this.log("trace", message, ...args);
  }

  debug(message: any, ...args: any[]) {
    this.log("debug", message, ...args);
  }

  info(message: any, ...args: any[]) {
    this.log("info", message, ...args);
  }

  warn(message: any, ...args: any[]) {
    this.log("warn", message, ...args);
  }

  error(message: any, ...args: any[]) {
    this.log("error", message, ...args);
  }

  // Helper for HTTP requests (useful for Cloud Run)
  httpRequest(req: any, res: any, latency: number) {
    this.info("HTTP Request", {
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.url,
        status: res.statusCode,
        latency: `${latency}ms`,
        userAgent: req.headers["user-agent"],
        remoteIp:
          req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
      },
    });
  }

  // Helper for structured errors
  errorWithContext(message: string, error: Error, context?: any) {
    this.error(message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    });
  }
}

// Export singleton instance
const logger = new SimpleLogger();
export default logger;

// Also export for loglevel compatibility if needed
export const log = logger;
