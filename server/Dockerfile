# ==============================================================================
# RMS Backend Production Dockerfile
# Multi-stage build for lightweight, secure container image
# ==============================================================================

# Stage 1: Build & TypeScript Compilation
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json tsconfig*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment defaults
ENV NODE_ENV=production \
    PORT=4000

# Create non-root system user and group for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production artifacts and dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose HTTP port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4000}/api/v1/health || exit 1

# Start standalone Express server
CMD ["node", "dist/index.js"]
