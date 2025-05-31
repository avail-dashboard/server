# Multi-stage Docker build for Avail Blockchain Explorer Backend
# Optimized for security, performance, and maintainability

# Build arguments for flexibility
ARG NODE_VERSION=18
ARG ALPINE_VERSION=3.18

# Build stage
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder

# Add metadata labels
LABEL stage=builder
LABEL description="Build stage for Avail Explorer Backend"

# Set build environment
ENV NODE_ENV=development
ENV CI=true

WORKDIR /app

# Security: Update Alpine packages and add build dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies with optimized flags
RUN npm install --no-audit --no-fund && \
    npm cache clean --force

# Copy source code (after dependencies for better caching)
COPY . .

# Build the application with production optimizations
RUN NODE_ENV=production npm run build && \
    # Cleanup unnecessary files after build
    rm -rf src/ tests/ *.md .eslintrc.js jest.config.js tsconfig.json

# Production stage
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS production

# Add metadata labels
LABEL maintainer="Avail Explorer Team"
LABEL description="Production image for Avail Blockchain Explorer Backend"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="Avail Explorer Backend"
LABEL org.opencontainers.image.description="Backend server for Avail blockchain explorer"
LABEL org.opencontainers.image.vendor="Avail"
LABEL org.opencontainers.image.licenses="MIT"

# Set production environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV PORT=3001

# Security: Update Alpine packages and install minimal runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    wget \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && update-ca-certificates

# Create app user with specific UID/GID for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S avail -u 1001 -G nodejs

WORKDIR /app

# Copy package files for production dependency installation
COPY package*.json ./

# Install only production dependencies with optimized flags
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts && \
    npm cache clean --force && \
    # Remove npm to reduce attack surface
    npm uninstall -g npm

# Copy built application from builder stage
COPY --from=builder --chown=avail:nodejs /app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p logs data && \
    chown -R avail:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 775 logs data

# Switch to non-root user
USER avail

# Expose port
EXPOSE ${PORT}

# Improved health check with better error handling and timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --timeout=5 http://localhost:${PORT}/health || exit 1

# Use dumb-init for proper signal handling and process management
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"] 