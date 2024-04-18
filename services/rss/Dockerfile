# Custom build image for running application, invoked in app.yaml runtime config
FROM node:16.20.0-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y

# Copy repo source and build feed service
COPY ./ /app/
WORKDIR /app/services/rss
RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)

# Copy node_modules to root
RUN cp -R node_modules /app/node_modules

RUN npx tsc

# Return to services/feed directory
ENTRYPOINT ["npm", "start"]