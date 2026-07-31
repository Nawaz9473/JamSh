# Production Dockerfile for JamSh Media Processing Worker
FROM node:20-alpine

# Install FFmpeg system binaries
RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm install -g typescript && tsc

CMD ["node", "dist/index.js"]
