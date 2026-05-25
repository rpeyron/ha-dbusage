FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM ghcr.io/home-assistant/amd64-base:latest AS runtime

WORKDIR /app

# Install Node.js and npm via Alpine package manager
RUN apk add --no-cache nodejs npm

COPY package*.json ./
# Install production dependencies
RUN npm ci --only=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "dist/server.js"]
