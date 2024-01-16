### npub-metadata

This is a cronjob that updates Podcast Index with all the latest new and revised feeds since the last run.

This job is dependent on the catalog monorepo's Prisma client.

It runs in Google Cloud Run as an automated job. The build config is in the monorepo root `./cronjob.npub-metadata.yaml`.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container locally:
`docker build -t publish -f cronjobs/npub-metadata/Dockerfile .`

Run container locally:
`docker run publish`
