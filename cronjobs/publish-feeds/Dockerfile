# Custom build image for running application, invoked in app.yaml runtime config
FROM node:16.20.0-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Copy repo source and build publish-feeds cronjob
COPY ./ /app/
WORKDIR /app/cronjobs/publish-feeds
RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)
RUN npx tsc

# Generate Prisma client from repo root
WORKDIR /app
RUN npx prisma generate

# Return to publish-feeds cronjob directory
WORKDIR /app/cronjobs/publish-feeds
ENTRYPOINT ["npm", "start"]