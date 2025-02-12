FROM node:22.13.1-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3200

CMD ["npm", "start"] 