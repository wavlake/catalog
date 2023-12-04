FROM node:16.20.0

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip