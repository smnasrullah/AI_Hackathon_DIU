FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements-dev.txt

COPY . .
# Guard against CRLF checkouts on Windows hosts.
RUN sed -i 's/\r$//' entrypoint.sh scripts/bootstrap.sh \
    && chmod +x entrypoint.sh scripts/bootstrap.sh

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health', timeout=2)"

ENTRYPOINT ["./entrypoint.sh"]
