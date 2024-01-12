### publish-feeds

This is a cronjob that updates the `npub` table with the latest profile metadata.

It runs in Google Cloud Run as an automated job. The build config is in the monorepo root `./cronjob.publish-feeds.yaml`.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container locally:
`docker build -t publish -f cronjobs/npub-metadata/Dockerfile .`

Run container locally:
`docker run publish`
