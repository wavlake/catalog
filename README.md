Install dependencies

```
npm install
```

Generate Prisma Client

```
npm run generate
```

Run the server in watch mode for development

```
npm run dev
```

Or, first build the app, and then run the server without watch mode

```
npm build
npm start
```

### Running database migrations

Update migrations

```
npm run migrate
```

Run Prisma introspection of updated DB

```
npm run pull
```

Regenerate Prisma client

```
npm run generate
```

Rollback last migration

```
npm run rollback
```

NOTE: Do not use Prisma's migration utility to snapshot or create new migrations. We currently use knexjs to manage the database schema and other properties that currently is not possible using Prisma migrations (e.g. constraints, triggers, and views)
