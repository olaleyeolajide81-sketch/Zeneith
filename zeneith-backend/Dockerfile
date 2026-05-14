FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN yarn install --frozen-lockfile
COPY src ./src
RUN yarn build
CMD ["node", "dist/index.js"]
