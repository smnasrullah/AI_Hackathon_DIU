# Playwright e2e runner. Browser version is pinned to the @playwright/test version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Typecheck first so a broken spec fails fast, then run the suite.
CMD ["sh", "-c", "npx tsc --noEmit && npx playwright test"]
