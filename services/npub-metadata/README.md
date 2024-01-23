### npub-metadata

This is a service that upserts an npub metadata kind 0 event into the npub table.

The npub records are used as metadata for comments.

This job is dependent on the catalog monorepo's Prisma client.

It runs in Google Cloud Run as a service. The build config is in the monorepo root `./service.npub-metadata.yaml`.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container locally:
`docker build -t npub -f services/npub-metadata/Dockerfile .`

Run container locally:
`docker run npub`
