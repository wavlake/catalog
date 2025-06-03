// Simple structured logger for Cloud Run - no dependencies needed!

type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

interface ErrorDetails {
  message: string;
  stack?: string;
  name: string;
}

interface HttpRequestDetails {
  requestMethod: string;
  requestUrl: string;
  status: number;
  latency: string;
  userAgent?: string;
  remoteIp?: string;
}

interface SourceLocation {
  file?: string;
  line?: number;
  function?: string;
}

interface LogEntry {
  severity: string;
  message: string;
  timestamp: string;
  labels?: Record<string, string>;
  error?: ErrorDetails;
  httpRequest?: HttpRequestDetails;
  additionalArgs?: any[];
  context?: Record<string, any>;
  "logging.googleapis.com/trace"?: string;
  "logging.googleapis.com/sourceLocation"?: SourceLocation;
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
const isValidLogLevel = (level: string): level is LogLevel => {
  return ['trace', 'debug', 'info', 'warn', 'error'].includes(level);
}

const envLogLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVEL = isValidLogLevel(envLogLevel) ? envLogLevel : 'info' as LogLevel;
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

  private extractTraceId(req?: any): string | undefined {
    if (!req?.headers) return undefined;

    const traceHeader = req.headers["x-cloud-trace-context"];
    if (traceHeader && process.env.GOOGLE_CLOUD_PROJECT) {
      const traceId = traceHeader.split("/")[0];
      return `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${traceId}`;
    }
    return undefined;
  }

  private log(
    level: LogLevel,
    message: any,
    context?: Record<string, any> | any,
    req?: any
  ) {
    if (!this.shouldLog(level)) return;

    // For development, use console methods
    if (process.env.NODE_ENV === "development") {
      const consoleMethod = level === "trace" ? "debug" : level;
      if (context) {
        console[consoleMethod](message, context);
      } else {
        console[consoleMethod](message);
      }
      return;
    }

    // Build structured log entry
    const logEntry: LogEntry = {
      severity: severityMap[level],
      message: typeof message === "string" ? message : JSON.stringify(message),
      timestamp: new Date().toISOString(),
      labels: serviceMetadata,
    };

    // Add trace ID if available
    const traceId = this.extractTraceId(req);
    if (traceId) {
      logEntry["logging.googleapis.com/trace"] = traceId;
    }

    // Add context if provided
    if (context) {
      logEntry.context = context;
    }

    // Handle errors specially
    if (message instanceof Error) {
      logEntry.message = message.message;
      logEntry.error = {
        message: message.message,
        stack: message.stack,
        name: message.name,
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

  trace(message: any, context?: Record<string, any> | any, req?: any) {
    this.log("trace", message, context, req);
  }

  debug(message: any, context?: Record<string, any> | any, req?: any) {
    this.log("debug", message, context, req);
  }

  info(message: any, context?: Record<string, any> | any, req?: any) {
    this.log("info", message, context, req);
  }

  warn(message: any, context?: Record<string, any> | any, req?: any) {
    this.log("warn", message, context, req);
  }

  error(message: any, context?: Record<string, any> | any, req?: any) {
    this.log("error", message, context, req);
  }

  // Helper for HTTP requests (useful for Cloud Run)
  httpRequest(req: any, res: any, latency: number) {
    const logEntry: LogEntry = {
      severity: "INFO",
      message: "HTTP Request",
      timestamp: new Date().toISOString(),
      labels: serviceMetadata,
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.url,
        status: res.statusCode,
        latency: `${latency}ms`,
        userAgent: req.headers?.["user-agent"],
        remoteIp:
          req.headers?.["x-forwarded-for"] || req.connection?.remoteAddress,
      },
    };

    // Add trace ID for request correlation
    const traceId = this.extractTraceId(req);
    if (traceId) {
      logEntry["logging.googleapis.com/trace"] = traceId;
    }

    const output = JSON.stringify(logEntry);
    process.stdout.write(output + "\n");
  }

  // Helper for structured errors with better typing
  errorWithContext(
    message: string,
    error: Error,
    context?: Record<string, any>,
    req?: any
  ) {
    const logEntry: LogEntry = {
      severity: "ERROR",
      message,
      timestamp: new Date().toISOString(),
      labels: serviceMetadata,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    };

    // Add trace ID if available
    const traceId = this.extractTraceId(req);
    if (traceId) {
      logEntry["logging.googleapis.com/trace"] = traceId;
    }

    // Add context if provided
    if (context) {
      logEntry.context = context;
    }

    // Add source location for errors (basic implementation)
    if (error.stack) {
      const stackLines = error.stack.split("\n");
      const callerLine = stackLines[1]; // First line after error message
      if (callerLine) {
        const match = callerLine.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
          logEntry["logging.googleapis.com/sourceLocation"] = {
            file: match[2],
            line: parseInt(match[3]),
            function: match[1],
          };
        }
      }
    }

    const output = JSON.stringify(logEntry);
    process.stderr.write(output + "\n");
  }

  // Utility method to create a child logger with persistent context
  child(context: Record<string, any>) {
    return {
      trace: (
        message: any,
        additionalContext?: Record<string, any>,
        req?: any
      ) => this.trace(message, { ...context, ...additionalContext }, req),
      debug: (
        message: any,
        additionalContext?: Record<string, any>,
        req?: any
      ) => this.debug(message, { ...context, ...additionalContext }, req),
      info: (
        message: any,
        additionalContext?: Record<string, any>,
        req?: any
      ) => this.info(message, { ...context, ...additionalContext }, req),
      warn: (
        message: any,
        additionalContext?: Record<string, any>,
        req?: any
      ) => this.warn(message, { ...context, ...additionalContext }, req),
      error: (
        message: any,
        additionalContext?: Record<string, any>,
        req?: any
      ) => this.error(message, { ...context, ...additionalContext }, req),
    };
  }
}

// Export singleton instance
const logger = new SimpleLogger();
export default logger;

// Also export for loglevel compatibility if needed
export const log = logger;
