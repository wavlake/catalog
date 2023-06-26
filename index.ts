const config = require("dotenv").config();
const express = require("express");
const app = express();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const port = process.env.EXPRESS_PORT;

// BigInt handling issue in Prisma: https://github.com/prisma/studio/issues/614
// eslint-disable-next-line @typescript-eslint/ban-ts-comment      <-- Necessary for my ESLint setup
// @ts-ignore: Unreachable code error                              <-- BigInt does not have `toJSON` method
BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

// Import routes
const accounts = require("./routes/accounts");
const albums = require("./routes/albums");
const artists = require("./routes/artists");
const tracks = require("./routes/tracks");

// ROUTES
app.use("/v1/accounts", accounts);
app.use("/v1/albums", albums);
app.use("/v1/artists", artists);
app.use("/v1/tracks", tracks);

app.get("/", (req, res) => {
  res.send("Testing!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
