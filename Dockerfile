# Image stored at Docker: blastshielddown/wavlake-catalog
FROM node:16.20.0

# Install Python 3
RUN apt-get update && apt-get install -y python3 python3-pip