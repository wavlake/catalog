import express from "express";
import bodyParser from "body-parser";
import { TakedownRequest } from "./types";

// You can import from your library files as needed
// Example: import { someHelper } from '@library/helpers';

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

app.post("/", async (req, res) => {
  try {
    const { artistId } = req.body as TakedownRequest;

    if (!artistId || !Array.isArray(artistId)) {
      return res
        .status(400)
        .json({ error: "Invalid request: artistId must be a non-empty array" });
    }

    // Process each artist ID
    for (const id of artistId) {
      console.log(`hello world ${id}`);
      // Actual processing logic will go here
    }

    return res.status(200).json({
      message: "Takedown request processed successfully",
      processedIds: artistId,
    });
  } catch (error) {
    console.error("Error processing takedown request:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Start the server
app.listen(port, () => {
  console.log(`Takedown service listening on port ${port}`);
});
