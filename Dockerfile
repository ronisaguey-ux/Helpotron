FROM python:3.12-slim

WORKDIR /app

# Copy requirements and install
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

# Copy backend + companion extension
COPY server/ /app/server/
COPY extension/ /app/extension/

# Copy web dist (built separately)
COPY web/dist/ /app/web/dist/

# Set production defaults
ENV PRODUCTION_MODE=true
ENV PORT=8000

# Create data directories
RUN mkdir -p /app/exports /app/datalake_storage /app/data_lake /app/uploads

# Run the API
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]