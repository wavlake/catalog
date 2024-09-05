### indexer

This service listens to a pool of relays for Wavlake content in events that are not indexed.

It then publishes a reference event with the event id and proper tagging.

#### Development

Run (from service root):

`npm install`

`npm run dev`

#### Docker

Build container locally (run from monorepo root):
`docker build -t payments -f services/nwc/Dockerfile .`

Run container locally:
`docker run nwc`
