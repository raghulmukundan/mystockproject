FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src/ ./src/
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY vitest.config.ts ./

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]