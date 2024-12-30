[![Node.js CI](https://github.com/wavlake/catalog/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/wavlake/catalog/actions/workflows/node.js.yml)

This is a monorepo for Wavlake's main backend processes and services. It consists of:

- catalog: the API that manages all content. This exists at the top level and runs as a Google Cloud Run service. Config is in `prod.yaml` in the project root.

- services:
  - accounting: the API that manages all payment-related interactions. This exists in the services directory.
  - indexer: listens to a pool of Nostr relays for Wavlake content to index for future reference
  - npub-metadata: reference for npub profile data
  - nwc: listens to Nostr relays for Nostr Wallet Connect events
  - rss: an API for responding to RSS feed requests
- cronjobs:
  - forwarder: forwards earnings to external lightning addresses
  - log-charts: records the top content daily
  - publish-feeds (deprecated): publishes content metadatda to Nostr events

More details about each process and service can be found in their respective directories.

### Developing

Install dependencies

```bash
npm install
```

Generate Prisma Client

```bash
npm run generate
```

Run the server in watch mode for development

```bash
npm run dev
```

Or, first build the app, and then run the server without watch mode

```bash
npm build
npm start
```

### Running database migrations

Update migrations

```bash
npm run migrate
```

Run Prisma introspection of updated DB

```bash
npm run pull
```

Regenerate Prisma client

```bash
npm run generate
```

Rollback last migration

```bash
npm run rollback
```

NOTE: Do not use Prisma's migration utility to snapshot or create new migrations. We currently use knexjs to manage the database schema and other properties that currently is not possible using Prisma migrations (e.g. constraints, triggers, and views)

### Creating a new database migration

If this is your first migration, install the migration cli

```bash
npm install knex -g
```

Change into the `db` directory

```bash
cd db
```

Create a new migration, choose a descriptive name for it

```bash
knex migrate:make adding_a_new_field_to_table
```

Open up the newly generated file, and edit it to meet your migration needs.

Save the file and then be sure to run `npm run migrate` to migrate your local db to the your new schema
