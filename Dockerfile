# Stage 1: Build the frontend
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Run the server
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/firebase-applet-config.json ./
# Install tsx to run the server.ts directly if needed, or you can compile it.
RUN npm install -g tsx

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Start the server using tsx
CMD ["tsx", "server.ts"]
