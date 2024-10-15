FROM node:20.17.0-slim

WORKDIR /app

# Install Python 3
RUN apt-get -y update && \
    apt-get install -y \
    python3 \
    python3-pip \
    apt-transport-https \
    ca-certificates \
    gnupg \
    curl \
    sudo

COPY . /app/
RUN npm install --unsafe-perm ||  ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)
RUN npx tsc
RUN npx prisma generate

EXPOSE 8080
ENTRYPOINT ["npm", "start"]