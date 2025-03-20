# Custom build image for running application
FROM node:20.17.0-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y

# Copy entire monorepo
COPY ./ /app/

# Install and build takedown service
WORKDIR /app/services/takedown
RUN npm install --unsafe-perm || ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)

# Generate Prisma client from repo root (if needed)
WORKDIR /app
RUN npm install --unsafe-perm || ((if [ -f npm-debug.log ]; then cat npm-debug.log; fi) && false)
RUN npx prisma generate

# Copy node_modules to root (helps with imports)
WORKDIR /app/services/takedown
RUN cp -R node_modules /app/node_modules

# Build the takedown service
WORKDIR /app/services/takedown
RUN mkdir -p dist
RUN npm run build

# Verify the build output exists
RUN ls -la dist/
RUN cat package.json

# Set environment variable for the port
ENV PORT=8080

# Start the service using node directly to avoid any npm start script issues
CMD ["node", "dist/index.js"]