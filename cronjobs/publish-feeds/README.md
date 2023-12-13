### publish-feeds

This is a cronjob that updates Podcast Index with all the latest new and revised feeds since the last run.

This job is dependent on the catalog monorepo's Prisma client and library functions.

#### Development

Run:

`npm install`

`npm run dev`

#### Docker

Build container:
`docker build -t publish -f cronjobs/publish-feeds/Dockerfile .`

Run container:
`docker run publish`
