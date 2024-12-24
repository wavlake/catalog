### nwc

This service listens to the Wavlake relay for NWC action events such as `get balance` and `pay invoice`.

It currently runs as a systemd process on the Wavlake relay server.

#### Development

Run (from service root):

`npm install`

`npm run dev`

#### Docker

Build container locally (run from monorepo root):
`docker build -t payments -f services/nwc/Dockerfile .`

Run container locally:
`docker run nwc`
