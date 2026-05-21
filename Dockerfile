# STAGE 1: Optimization & Bundling
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Install only production dependencies
RUN npm install --production

# STAGE 2: Final ultra-lightweight environment
# We use alpine:3.19 (approx 7MB) instead of node:alpine (approx 130MB)
FROM alpine:3.19
WORKDIR /app

# Install ONLY the nodejs runtime and essential network tools
# This is much smaller than the full node-alpine image
RUN apk add --no-cache \
    nodejs \
    wireless-tools \
    wpa_supplicant \
    iw \
    iproute2 \
    procps \
    util-linux \
    docker-cli

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy only necessary application files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY package.json ./

EXPOSE 3000
CMD ["node", "backend/server.js"]
