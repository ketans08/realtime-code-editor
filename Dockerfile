# Root Dockerfile for Render deployment
# This orchestrates docker-compose for backend + frontend
FROM docker:24-dind

# Install docker-compose
RUN apk add --no-cache docker-compose

# Copy project files
WORKDIR /app
COPY . .

# Expose ports
EXPOSE 3000 5001

# Start services
CMD ["docker-compose", "up", "--build"]
