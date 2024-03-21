### npub-metadata

This is a service that manages all incoming and outgoing payments from our Lightning service provider.

This service is dependent on the catalog monorepo's Prisma client.

It runs in Google Cloud Run as a service. The build config is in the monorepo root `./service.payments.yaml`.

#### Development

Run (from service root):

`npm install`

`npm run dev`

#### Docker

Build container locally (run from monorepo root):
`docker build -t payments -f services/payments/Dockerfile .`

Run container locally:
`docker run payments`
