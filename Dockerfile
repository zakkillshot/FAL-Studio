FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh","-c","mkdir -p public && cp index.html public/index.html && cp icon.svg public/icon.svg && node server.js"]
