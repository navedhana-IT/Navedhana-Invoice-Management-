# API and worker share this image; the worker overrides CMD with `node dist/worker.js`.
# The Playwright base ships Chromium for PDF rendering; its tag must match playwright-core in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production PORT=4000
USER pwuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
