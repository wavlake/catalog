import { errorHandler } from "@middlewares/errorHandler";
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
const sentryTracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE;

// To obtain the client's IP address from behind the nginx proxy
// Info: https://expressjs.com/en/guide/behind-proxies.html
app.set("trust proxy", 1);

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
// TODO: Invoice
import deposit from "./routes/deposit";
import invoice from "./routes/invoice";
import send from "./routes/send";
import withdraw from "./routes/withdraw";
import callback from "./routes/callback";

app.use(cors(corsOptions));

// ROUTES
app.use("/v1/deposit", deposit);
app.use("/v1/invoice", invoice);
app.use("/v1/send", send);
app.use("/v1/withdraw", withdraw);
app.use("/v1/callback", callback);

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// override default html error page with custom error handler
app.use(errorHandler);
const port = parseInt(process.env.PORT) || 8080;
export const server = app.listen(port, () => {
  log.debug(`Payments is listening on port ${port}`);
});
