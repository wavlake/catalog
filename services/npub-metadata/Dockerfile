# Custom build image for running application, invoked in app.yaml runtime config
FROM node:16.20.0-slim

WORKDIR /app

RUN apt-get update -y

# Copy repo source and build npub-metadata service
COPY ./ /app/
WORKDIR /app/services/npub-metadata
RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)

# Generate Prisma client from repo root
# WORKDIR /app
# RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)
# RUN npx tsc
# RUN npx prisma generate

# Return to npub-metadata cronjob directory
WORKDIR /app/services/npub-metadata
ENTRYPOINT ["npm", "start"]