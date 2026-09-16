# WebAssembly Server Architecture & Google Cloud Run Reference

This reference covers hosting WebAssembly (WASM) Ebitengine builds on **Google Cloud Run** and providing server-side REST API endpoints for global state tracking (such as high scores and leaderboards).

> **Official GCP Reference Implementation**: See [devrel-demos/gemini-cli-match3-golang/Dockerfile](https://github.com/GoogleCloudPlatform/devrel-demos/blob/main/codelabs/gemini-cli/gemini-cli-match3-golang/Dockerfile) for the authoritative Dockerfile build pipeline.

---

## 1. Google Cloud Run Hosting Architecture

Google Cloud Run is the primary target for hosting Ebitengine WASM applications because:
- **Automatic Scaling to Zero**: Zero cost when idle; scales instantly on incoming traffic spikes.
- **Managed HTTPS & Custom Domains**: Automatic TLS termination and global edge distribution.
- **Unified Single-Binary / Container**: The Go server embeds static WASM assets (`//go:embed public/*`) and serves both the game UI and backend REST APIs from one container image.

---

## 2. Server Implementation (`cmd/server/main.go`)

Cloud Run injects a `PORT` environment variable (default `8080`). The Go server binds to `:$PORT` and serves embedded public web assets alongside REST API endpoints:

```go
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

//go:embed public/*
var publicFS embed.FS

type ScoreEntry struct {
	PlayerName string    `json:"player_name"`
	Score      int       `json:"score"`
	Timestamp  time.Time `json:"timestamp"`
}

type HighScoreStore struct {
	mu     sync.RWMutex
	scores []ScoreEntry
}

func main() {
	store := &HighScoreStore{}

	// Sub-filesystem for embedded public WASM web assets
	staticFS, err := fs.Sub(publicFS, "public")
	if err != nil {
		log.Fatalf("Failed to initialize static filesystem: %v", err)
	}

	http.Handle("/", http.FileServer(http.FS(staticFS)))

	// Leaderboard REST API Endpoints
	http.HandleFunc("/api/v1/scores", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			store.mu.RLock()
			defer store.mu.RUnlock()
			json.NewEncoder(w).Encode(store.scores)

		case http.MethodPost:
			var entry ScoreEntry
			if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			entry.Timestamp = time.Now()

			store.mu.Lock()
			store.scores = append(store.scores, entry)
			store.mu.Unlock()

			w.WriteHeader(http.StatusCreated)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Cloud Run dynamic PORT binding
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s...", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), nil); err != nil {
		log.Fatal(err)
	}
}
```

---

## 3. Reference Cloud Run Dockerfile (`Dockerfile`)

Based directly on the GCP [gemini-cli-match3-golang Dockerfile](https://github.com/GoogleCloudPlatform/devrel-demos/blob/main/codelabs/gemini-cli/gemini-cli-match3-golang/Dockerfile), the container build compiles the WebAssembly payload, bundles the web assets into `public/`, compiles the server binary, and runs in a minimal container:

```dockerfile
# Build stage 1: Compile the Go server and WASM
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# 1. Build WASM binary into public directory
RUN GOOS=js GOARCH=wasm go build -o public/game.wasm ./cmd/game

# 2. Bundle static web assets and Go WASM glue into public directory
# Note: wasm_exec.js location varies by OS/distro; querying $(go env GOROOT) is safest across platforms
RUN mkdir -p public/assets && \
    cp index.html public/ && \
    cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/ && \
    cp -r assets/* public/assets/

### OS Location Variations for `wasm_exec.js`
When copying `wasm_exec.js` locally outside Docker, use `$(go env GOROOT)` to resolve the active path automatically:
- **Go Toolchain Query (Cross-Platform)**: `$(go env GOROOT)/misc/wasm/wasm_exec.js` or `$(go env GOROOT)/lib/wasm/wasm_exec.js`
- **Linux / Docker Container**: `/usr/local/go/misc/wasm/wasm_exec.js`
- **macOS (Homebrew Apple Silicon)**: `/opt/homebrew/opt/go/libexec/misc/wasm/wasm_exec.js`
- **macOS (Homebrew Intel)**: `/usr/local/opt/go/libexec/misc/wasm/wasm_exec.js`
- **Windows**: `%GOROOT%\misc\wasm\wasm_exec.js`

# 3. Build HTTP Server binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Stage 2: Final minimal runtime container for Cloud Run
FROM gcr.io/distroless/static-debian12

COPY --from=builder /server /server

EXPOSE 8080
ENTRYPOINT ["/server"]
```

---

## 4. Google Cloud Run Deployment

Deploy the container image to Google Cloud Run using `gcloud`:

```bash
# Build and push container image using Cloud Build
gcloud builds submit --tag gcr.io/$GCP_PROJECT/ebiten-wasm-game

# Deploy container service to Cloud Run
gcloud run deploy ebiten-wasm-game \
  --image gcr.io/$GCP_PROJECT/ebiten-wasm-game \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```
