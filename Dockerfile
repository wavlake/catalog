# Image stored at Docker: blastshielddown/wavlake-catalog
FROM node:16.20.0

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

RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

RUN sudo apt-get update && sudo apt-get install google-cloud-cli

ENTRYPOINT ["npm"]