import { errorHandler } from "./middlewares/errorHandler";
import express from "express";
import { logger } from "./middlewares/logger";

const config = require("dotenv").config();
const fs = require("fs");
const app = express();
const log = require("loglevel");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const Sentry = require("@sentry/node");

const corsHost = process.env.CORS_HOST;
log.setLevel(process.env.LOGLEVEL);
const port = process.env.EXPRESS_PORT;
const localConvertPath = `${process.env.LOCAL_CONVERT_PATH}`;
const localUploadPath = `${process.env.LOCAL_UPLOAD_PATH}`;
const sentryDsn = process.env.SENTRY_DSN;
const sentryTracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE;

// To obtain the client's IP address from behind the nginx proxy
// Info: https://expressjs.com/en/guide/behind-proxies.html
app.set("trust proxy", true);

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
  tracesSampleRate: parseFloat(sentryTracesSampleRate), // Capture 100% of the transactions, reduce in production!,
});

// Trace incoming requests
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Creates temp folders if they don't exist
fs.mkdirSync(localConvertPath, { recursive: true }, (err) => {
  if (err) throw err;
});

fs.mkdirSync(localUploadPath, { recursive: true }, (err) => {
  if (err) throw err;
});

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
app.use(logger);

// Import routes
import accounts from "./routes/accounts";
import albums from "./routes/albums";
import artists from "./routes/artists";
import charts from "./routes/charts";
import meta from "./routes/meta";
import stats from "./routes/stats";
import tracks from "./routes/tracks";
import episodes from "./routes/episodes";
import podcasts from "./routes/podcasts";
import search from "./routes/search";
import splits from "./routes/splits";
import comments from "./routes/comments";
import library from "./routes/library";
import feeds from "./routes/feeds";
import playlists from "./routes/playlists";

app.use(cors(corsOptions));

// ROUTES
app.use("/v1/accounts", accounts);
app.use("/v1/albums", albums);
app.use("/v1/artists", artists);
app.use("/v1/charts", charts);
app.use("/v1/meta", meta);
app.use("/v1/stats", stats);
app.use("/v1/tracks", tracks);
app.use("/v1/episodes", episodes);
app.use("/v1/podcasts", podcasts);
app.use("/v1/search", search);
app.use("/v1/splits", splits);
app.use("/v1/comments", comments);
app.use("/v1/library", library);
app.use("/v1/feeds", feeds);
app.use("/v1/playlists", playlists);

// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// override default html error page with custom error handler
app.use(errorHandler);
export const server = app.listen(port, () => {
  log.debug(`Wavlake catalog is listening on port ${port}`);
});
