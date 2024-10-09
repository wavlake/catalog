# Custom build image for running application, invoked in app.yaml runtime config
FROM node:20.17.0-slim

RUN apt-get update -y

# Copy repo source and build publish-feeds cronjob
COPY ./cronjobs/log-charts /app
WORKDIR /app
RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)

ENTRYPOINT ["npm", "start"]