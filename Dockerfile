# Build stage for React frontend
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY public ./public
COPY src ./src

# Build React
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --production

# Copy backend code
COPY server.js ./
COPY src ./src

# Copy built React app from builder
COPY --from=builder /app/build ./build

# Expose port
EXPOSE 5001

# Set environment
ENV NODE_ENV=production
ENV PORT=5001

# Start server
CMD ["node", "server.js"]
