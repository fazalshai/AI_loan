FROM python:3.10-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy spreadsheets and backend source files
COPY *.xlsx ./
COPY backend/ ./

# Expose port (Cloud Run uses PORT env, default to 8080)
EXPOSE 8080

CMD ["python", "api_server.py"]
