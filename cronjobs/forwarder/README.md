### Forwarder

This is a cronjob that forwards payments to users who have specified a Lightning Address to receive to.

This job is dependent on the catalog monorepo's Prisma client.

It runs in Google Cloud Run as an automated job. The build config is in the monorepo root `./cronjob.forwarder.yaml`.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container locally:
`docker build -t forwarder -f cronjobs/forwarder/Dockerfile .`

Run container locally:
`docker run forwarder`
