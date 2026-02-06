# Stage 1: Build the Vite application
FROM node:22-alpine AS build
WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Build the frontend (no ARG for secrets - they're injected at runtime)
RUN npm run build

# Stage 2: Production runtime with Node.js server
FROM node:22-alpine
WORKDIR /app

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy server code
COPY --from=build /app/server ./server

# Copy package files for production dependencies
COPY --from=build /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Cloud Run uses port 8080 by default
EXPOSE 8080

# Start the Express server (which serves the static frontend)
CMD ["node", "server/index.js"]
