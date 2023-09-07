[![Node.js CI](https://github.com/wavlake/catalog/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/wavlake/catalog/actions/workflows/node.js.yml)

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
