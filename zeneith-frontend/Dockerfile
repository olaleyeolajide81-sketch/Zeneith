FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json next.config.js ./
RUN yarn install --frozen-lockfile
COPY src ./src
RUN yarn build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
CMD ["yarn", "start"]
