# Test image: runs lint, type checks, and the test suite.
FROM node:22.12.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
USER node
CMD ["npm", "run", "check"]
