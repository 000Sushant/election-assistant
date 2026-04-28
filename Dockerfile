# Stage 1: Build the Angular Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build --configuration=production

# Stage 2: Serve with Express Backend
FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./
# Copy compiled frontend from Stage 1 into the backend's public directory
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public

# Expose port and start
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
