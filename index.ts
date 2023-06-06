const config = require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.EXPRESS_PORT;

// Import routes
const track = require("./routes/tracks");

// ROUTES
app.use("/tracks", track);

app.get("/", (req, res) => {
  res.send("Testing!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
