# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend Runtime
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PORT=7860 \
    DEBUG=false

# Install backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create non-root user for Hugging Face Spaces & security
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Copy backend code, cached market data, and compiled frontend
COPY backend/ ./backend/
COPY .cache/market_data/ ./.cache/market_data/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure permissions for sqlite database and cache writes
RUN chown -R user:user /app
USER user

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
