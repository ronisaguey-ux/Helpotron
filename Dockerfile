FROM python:3.12-slim

WORKDIR /app

# Copy requirements and install
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

# Copy backend
COPY server/ /app/server/

# Copy web dist (built separately)
COPY web/dist/ /app/web/dist/

# Copy .env.example as .env (override in production)
COPY .env.example /app/.env

# Create data directories
RUN mkdir -p /app/exports /app/datalake_storage /app/data_lake

# Run the API
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]