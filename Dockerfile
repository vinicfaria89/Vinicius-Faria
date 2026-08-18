FROM node:20-slim

# Bibliotecas de sistema exigidas pelo Chromium que o Puppeteer baixa durante o `npm install`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4321

# Roda como usuário sem privilégios (mais seguro que root, e evita a necessidade de --no-sandbox
# no Chromium em muitos casos — o app já passa --no-sandbox de qualquer forma, ver lib/pdf.js).
RUN groupadd -r gcbapp && useradd -r -g gcbapp -G audio,video gcbapp \
    && mkdir -p /app/output && chown -R gcbapp:gcbapp /app
USER gcbapp

CMD ["node", "server.js"]
