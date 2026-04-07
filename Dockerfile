FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
EXPOSE 5000
CMD ["npm", "start"]
