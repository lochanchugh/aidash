# Use Node.js LTS (Slim for minimal size)
FROM node:20-slim

# Install system dependencies for metrics (systeminformation) and wifi (node-wifi)
RUN apt-get update && apt-get install -y \
    lm-sensors \
    wireless-tools \
    network-manager \
    iproute2 \
    procps \
    && npm install -g @google/gemini-cli \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
