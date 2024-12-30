import express from "express";
const log = require("loglevel");
const config = require("dotenv").config();
const app = express();
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const Sentry = require("@sentry/node");

const corsHost = process.env.CORS_HOST;
log.setLevel(process.env.LOGLEVEL || "info");
const sentryDsn = process.env.SENTRY_DSN;
const sentryTracesSampleRate = parseFloat(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.0"
);

Sentry.init({
  dsn: sentryDsn,
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable Express.js middleware tracing
    new Sentry.Integrations.Express({ app }),
    // Automatically instrument Node.js libraries and frameworks
    ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
  ],
  environment: process.env.NODE_ENV,
  // Performance Monitoring
  tracesSampleRate: sentryTracesSampleRate, // Capture 100% of the transactions, reduce in production!,
});

// Trace incoming requests
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

const corsOptions = {
  origin: { corsHost },
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

// BigInt handling issue in Prisma: https://github.com/prisma/studio/issues/614
// eslint-disable-next-line @typescript-eslint/ban-ts-comment      <-- Necessary for my ESLint setup
// @ts-ignore: Unreachable code error                              <-- BigInt does not have `toJSON` method
BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

// Apply middleware
// Note: Keep this at the top, above routes
app.use(helmet());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

// Import routes
import feed from "./routes/feed";

app.use(cors(corsOptions));

// ROUTES
app.use("/v1", feed);

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// override default html error page with custom error handler
const port = 8080;
export const server = app.listen(port, () => {
  log.info(`Feed is listening on port ${port}`);
});
