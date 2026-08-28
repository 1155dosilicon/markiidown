# Exemplo de Dockerfile
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Instala dependencias
COPY package.json ./
RUN bun install --frozen-lockfile --production

# Copia código-fonte
COPY . .

# Compila executável
RUN bun run build:exe

EXPOSE 8080
ENTRYPOINT ["bun", "run", "src/index.ts"]
