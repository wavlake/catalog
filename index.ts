const config = require("dotenv").config();
const express = require("express");
const app = express();
const log = require("loglevel");
const cors = require("cors");

log.setLevel(process.env.LOGLEVEL);
const port = process.env.EXPRESS_PORT;
const corsHost = process.env.CORS_HOST;

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

// Import routes
const accounts = require("./routes/accounts");
const artists = require("./routes/artists");
const tracks = require("./routes/tracks");

app.use(cors(corsOptions));

// ROUTES
app.use("/v1/accounts", accounts);
app.use("/v1/artists", artists);
app.use("/v1/tracks", tracks);

app.get("/", (req, res) => {
  res.send("Testing!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
