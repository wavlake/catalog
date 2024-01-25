require("dotenv").config();
require("websocket-polyfill");
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
import express from "express";

const app = express();

const port = parseInt(process.env.PORT) || 8080;
export const server = app.listen(port, () => {
  log.debug(`payments service listening on port ${port}`);
});
