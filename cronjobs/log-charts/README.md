### log-charts

This is a cronjob that updates the `ranking_forty` table with all the current chart rankings for future reference.

This job has no dependencies from the monorepo.

It runs in Google Cloud Run as an automated job. The build config is in the monorepo root `./cronjob.log-charts.yaml`.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container locally:
`docker build -t log-charts -f cronjobs/log-charts/Dockerfile .`

Run container locally:
`docker run log-charts`
