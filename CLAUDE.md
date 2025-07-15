# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wavlake Catalog is a TypeScript/Node.js monorepo for Wavlake's main backend processes and services. It consists of:

- **catalog**: Main API that manages all content (tracks, albums, artists, podcasts, episodes). Runs at the top level as a Google Cloud Run service.
- **services**: Microservices including accounting (payments), indexer (Nostr content), npub-metadata, nwc (Nostr Wallet Connect), rss (RSS feeds), and takedown
- **cronjobs**: Scheduled tasks for forwarder (earnings forwarding), log-charts (daily top content), and publish-feeds (deprecated)

## Common Development Commands

### Setup and Dependencies

```bash
npm install                 # Install dependencies
npm run generate           # Generate Prisma Client (required after schema changes)
```

### Development

```bash
npm run dev               # Run in watch mode with TypeScript compilation and nodemon
npm run build             # Compile TypeScript to dist/
npm start                # Run compiled JavaScript from dist/
```

### Database Operations

```bash
npm run migrate          # Apply latest Knex migrations
npm run rollback         # Rollback last migration
npm run pull             # Prisma introspection of updated DB
npm run generate         # Regenerate Prisma client after DB changes
```

### Testing

```bash
npm test                 # Run unit tests (excludes integration tests)
npm run integration     # Run integration tests with --detectOpenHandles --forceExit
```

### Database Migration Creation

```bash
cd db                    # Change to db directory
knex migrate:make migration_name  # Create new migration (requires knex CLI: npm install knex -g)
npm run migrate          # Apply the migration locally
```

## Architecture Overview

### Database & ORM

- **PostgreSQL** database with dual ORM approach:
  - **Prisma**: Primary ORM for type-safe queries and client generation
  - **Knex**: Migration management, constraints, triggers, and views (Prisma limitations)
- Database views: `TrackInfo` and `EpisodeInfo` for aggregated data
- Important: Use Knex for migrations, NOT Prisma migrations

### Authentication & Authorization

- **Firebase Admin SDK**: Primary authentication via JWT tokens
- **Nostr Protocol**: NIP-98 authentication for decentralized identity
- Middleware: `isAuthorized`, `isNostrAuthorized`, `isNostrAuthorizedOptional`
- Content ownership validation via `isAlbumOwner`, `isTrackOwner`

### API Structure

- RESTful API with `/v1/` prefix
- Express.js with TypeScript
- Routes in `/routes/` import controllers from `/controllers/`
- Middleware for auth, error handling, logging, pagination validation
- Rate limiting and security via helmet, compression, CORS

### Key Data Models

- **Content**: Track, Album, Artist, Episode, Podcast
- **Payments**: Transaction, Amp (payments), Split, TimeSplit, Forward
- **Social**: Comment, Playlist, User, Subscriber
- **Nostr**: NostrTrack, UserPubkey, zap_request
- **Promotions**: Promo, PromoReward, battery_reward

### File Storage & CDN

- **AWS S3**: Raw and processed audio files
- **CloudFront CDN**: Content delivery
- File prefixes: `AWS_S3_RAW_PREFIX`, `AWS_S3_TRACK_PREFIX`
- OP3 integration for podcast analytics

### Services Architecture

Each service has its own:

- `package.json` and `node_modules`
- `Dockerfile` for containerization
- TypeScript configuration (`tsconfig.json`)
- Service-specific README

### Logging & Monitoring

- **Structured logging**: Custom logger in `library/logger.ts` for Cloud Run
- **Sentry**: Error tracking and performance monitoring
- **Request tracing**: Built-in HTTP request logging middleware
- Environment-specific log levels via `LOGLEVEL`

### Development Patterns

- Controllers use `asyncHandler` for error handling
- Database queries primarily through Prisma client
- UUID validation using `validate` from uuid package
- Pagination helpers via `parseLimit`
- Content shuffling and randomization utilities

## Code Conventions

### File Organization

- Controllers in `/controllers/` (TypeScript)
- Routes in `/routes/` (mixed JS/TS)
- Shared utilities in `/library/`
- Middleware in `/middlewares/`
- Database schema in `/prisma/schema.prisma`
- Migrations in `/db/migrations/`

### TypeScript Configuration

- Target: ES2021
- CommonJS modules
- Strict mode: disabled
- Output to `./dist/`
- Excludes services, cronjobs, and dist from compilation

### Environment Requirements

- Node.js version: >=20.17.0 <21
- Environment variables loaded via dotenv
- Database connection via `DATABASE_URL`

## Important Notes

- **Migration Strategy**: Always use Knex for database migrations, not Prisma
- **BigInt Handling**: Custom toJSON prototype for BigInt serialization
- **Content Processing**: Tracks/episodes have processing states and compressor error handling
- **Nostr Integration**: Supports NIP-98 auth and content publishing to Nostr relays
- **Multi-tenancy**: User-based content ownership with proper authorization checks
- **Payment System**: Complex amp/split system for Lightning Network payments
