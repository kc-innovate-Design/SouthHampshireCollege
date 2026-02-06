# Stage 1: Build the Vite application
FROM node:20-slim AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application and build it
COPY . .
RUN npm run build

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the build output to the Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Create a basic Nginx configuration to support SPA routing on port 8080
RUN echo 'server { \
    listen 8080; \
    server_name localhost; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    error_page 500 502 503 504 /50x.html; \
    location = /50x.html { \
        root /usr/share/nginx/html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
