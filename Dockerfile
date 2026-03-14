# Use Node.js LTS (Slim for minimal size)
FROM node:20-slim

# Install system dependencies for metrics, wifi, and headless server control
RUN apt-get update && apt-get install -y \
    lm-sensors \
    wireless-tools \
    network-manager \
    wpasupplicant \
    iw \
    iproute2 \
    procps \
    && npm install -g @google/gemini-cli \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Ensure root is in the netdev group for WiFi socket access
RUN usermod -a -G netdev root || true

COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
