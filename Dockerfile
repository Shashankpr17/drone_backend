FROM node:20-bookworm-slim

# Install FFmpeg, Python3, and Pip for continuous ML video stream processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python ML requirements
COPY ml/requirements.txt ./ml/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r ml/requirements.txt

# Install Node.js dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

# Copy source code and ML weights
WORKDIR /app
COPY backend ./backend
COPY ml ./ml

# Build TypeScript backend
WORKDIR /app/backend
RUN npm run build
RUN npm run seed

EXPOSE 8000 10000

ENV PORT=8000
ENV NODE_ENV=production
ENV API_PREFIX=/api/v1
ENV CORS_ORIGIN=*
ENV PYTHON_BIN=python3

CMD ["npm", "start"]
