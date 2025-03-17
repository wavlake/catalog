// health.ts
import * as http from "http";
import log from "loglevel";

let isServiceHealthy = true; // Service starts as healthy
let relayConnectionStatus = false; // Track relay connection
let lastEventTime = Date.now(); // Track when we last processed an event

// Function to start the health check server
export function startHeartbeat(port = 8080) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      // Basic health check - just verifies the service is running
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Service is running\n");
    } else if (req.url === "/status") {
      // More detailed status check
      if (isServiceHealthy && relayConnectionStatus) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "UP",
            relay: relayConnectionStatus ? "connected" : "disconnected",
            uptime: process.uptime(),
            lastEventTime: new Date(lastEventTime).toISOString(),
            memory: process.memoryUsage(),
          })
        );
      } else {
        // If the relay connection is down, return unhealthy status
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "DOWN",
            relay: relayConnectionStatus ? "connected" : "disconnected",
            uptime: process.uptime(),
            lastEventTime: new Date(lastEventTime).toISOString(),
            memory: process.memoryUsage(),
          })
        );
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found\n");
    }
  });

  server.listen(port, () => {
    log.info(`Health check server listening on port ${port}`);
  });

  // Handle server errors
  server.on("error", (err) => {
    log.error(`Health check server error: ${err}`);
    isServiceHealthy = false;
  });

  return server;
}

// Functions to update service status
export function setServiceHealthy(healthy: boolean) {
  isServiceHealthy = healthy;
}

export function setRelayConnectionStatus(connected: boolean) {
  relayConnectionStatus = connected;
}

export function updateLastEventTime() {
  lastEventTime = Date.now();
}
