# Stage 1: Build dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production

# Stage 2: Final minimal image
FROM node:20-alpine
WORKDIR /app

# Install only essential runtime tools
RUN apk add --no-cache \
    wireless-tools \
    wpa_supplicant \
    iw \
    iproute2 \
    procps \
    util-linux

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["node", "backend/server.js"]
