### indexer

This service listens to a pool of relays for Wavlake content in events that are not indexed.

It then publishes a reference event with the event id and proper tagging.

#### Historical

To run on a previous day, pass in the Unix timestamp as an arg.

Example:
`npm start -- -t 1725486157`

#### Development

The service depends on a sqlite3 database to log the timestamp of the last published event.

To initialize the db, run `knex migrate:latest` from the `db` folder.

Run (from service root):

`npm install`

`npm run dev`

#### Docker

Build container locally (run from monorepo root):
`docker build -t payments -f services/nwc/Dockerfile .`

Run container locally:
`docker run nwc`
