FROM node:18-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy local code to the container
COPY . .

# Copy library files from monorepo
# This assumes you're building the Docker image from the root of your monorepo
# If you build differently, you'll need to adjust these paths
COPY ../../library ./library
COPY ../../prisma ./prisma
COPY ../../middlewares ./middlewares
COPY ../../types ./types

# Build the application
RUN npm run build

# Run the web service on container startup
CMD [ "node", "dist/index.js" ]