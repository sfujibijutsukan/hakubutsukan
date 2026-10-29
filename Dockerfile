FROM node:24-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
RUN npm run build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
COPY web ./web
COPY --from=frontend /src/web/museum.bundle.js ./web/museum.bundle.js
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /hakubutsukan .

FROM scratch
COPY --from=build /hakubutsukan /hakubutsukan
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hakubutsukan"]
