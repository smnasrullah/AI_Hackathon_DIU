FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# LightGBM needs the OpenMP runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Dev/tools target (ruff, pytest): used by the compose "tools" profile and scripts/check.*
FROM base AS dev
ENV APP_ENV=test
COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY . .

FROM base AS runtime
COPY . .
# Guard against CRLF checkouts on Windows hosts.
RUN sed -i 's/\r$//' entrypoint.sh scripts/bootstrap.sh \
    && chmod +x entrypoint.sh scripts/bootstrap.sh

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health', timeout=2)"

ENTRYPOINT ["./entrypoint.sh"]
