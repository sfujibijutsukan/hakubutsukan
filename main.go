package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed web/*
var assets embed.FS

type Exhibit struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	URL         string `json:"url"`
	PreviewURL  string `json:"previewUrl,omitempty"`
	Preview     string `json:"preview,omitempty"`
	Category    string `json:"category"`
	Icon        string `json:"icon"`
	State       string `json:"state"`
	Health      string `json:"health"`
	Order       int    `json:"order"`
}

type Catalog struct {
	Exhibits       []Exhibit `json:"exhibits"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Stale          bool      `json:"stale"`
	Message        string    `json:"message,omitempty"`
	Demo           bool      `json:"demo"`
	DockgeURL      string    `json:"dockgeUrl,omitempty"`
	PreviewOrigins []string  `json:"previewOrigins"`
}

type container struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	Labels map[string]string `json:"Labels"`
	State  string            `json:"State"`
	Status string            `json:"Status"`
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func webURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return ""
	}
	return u.String()
}

var hostname = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]+)?$`)

// Previews are local images, never arbitrary URLs fetched by the server.
var previewPath = regexp.MustCompile(`^/previews/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|jpg|jpeg|webp)$`)

func previewURL(raw string) string {
	if previewPath.MatchString(raw) {
		return raw
	}
	return ""
}

func exhibitURL(labels map[string]string) string {
	if raw, ok := labels["hakubutsukan.url"]; ok {
		return webURL(raw)
	}
	// Only infer a single plain hostname. Caddy matchers, paths and multiple sites need an explicit URL.
	caddy := strings.TrimSpace(labels["caddy"])
	if strings.HasPrefix(caddy, "https://") || strings.HasPrefix(caddy, "http://") {
		return webURL(caddy)
	}
	if hostname.MatchString(caddy) {
		return webURL("https://" + caddy)
	}
	return ""
}

func exhibitsFrom(containers []container) []Exhibit {
	result := make([]Exhibit, 0)
	for _, c := range containers {
		l := c.Labels
		if l["hakubutsukan.enable"] != "true" {
			continue
		}
		id := l["com.docker.compose.project"] + "/" + l["com.docker.compose.service"]
		if id == "/" {
			id = strings.TrimPrefix(first(c.Names), "/")
		}
		if id == "" {
			id = c.ID
		}
		if custom := l["hakubutsukan.id"]; custom != "" {
			id = custom
		}
		name := l["hakubutsukan.name"]
		if name == "" {
			name = l["com.docker.compose.service"]
		}
		if name == "" {
			name = id
		}
		category := l["hakubutsukan.category"]
		if category == "" {
			category = "その他"
		}
		icon := l["hakubutsukan.icon"]
		if icon == "" {
			icon = "◈"
		}
		health := "none"
		switch {
		case strings.Contains(c.Status, "(unhealthy)"):
			health = "unhealthy"
		case strings.Contains(c.Status, "(healthy)"):
			health = "healthy"
		case strings.Contains(c.Status, "(health: starting)"):
			health = "starting"
		}
		order, _ := strconv.Atoi(l["hakubutsukan.order"])
		result = append(result, Exhibit{ID: id, Name: name, Description: l["hakubutsukan.description"], URL: exhibitURL(l), Preview: previewURL(l["hakubutsukan.preview"]), PreviewURL: webURL(l["hakubutsukan.preview_url"]), Category: category, Icon: icon, State: c.State, Health: health, Order: order})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Order != result[j].Order {
			return result[i].Order < result[j].Order
		}
		if result[i].Name != result[j].Name {
			return result[i].Name < result[j].Name
		}
		return result[i].ID < result[j].ID
	})
	// Replicas with the same logical ID form one exhibit; report the least healthy state.
	merged := make([]Exhibit, 0, len(result))
	seen := make(map[string]int)
	for _, e := range result {
		if i, ok := seen[e.ID]; ok {
			if e.State != "running" {
				merged[i].State = e.State
			}
			if healthRank(e.Health) > healthRank(merged[i].Health) {
				merged[i].Health = e.Health
			}
			continue
		}
		seen[e.ID] = len(merged)
		merged = append(merged, e)
	}
	return merged
}

func first(s []string) string {
	if len(s) > 0 {
		return s[0]
	}
	return ""
}
func healthRank(s string) int {
	switch s {
	case "unhealthy":
		return 3
	case "starting":
		return 2
	case "none":
		return 1
	}
	return 0
}

type dockerSource struct{ client *http.Client }

func newDockerSource(socket string) dockerSource {
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	return dockerSource{client: &http.Client{Transport: transport, Timeout: 8 * time.Second}}
}

func getJSON(ctx context.Context, client *http.Client, endpoint string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("upstream returned %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(target)
}

var apiVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+$`)

func (d dockerSource) load(ctx context.Context) ([]Exhibit, error) {
	var version struct {
		APIVersion string `json:"ApiVersion"`
	}
	if err := getJSON(ctx, d.client, "http://docker/version", &version); err != nil {
		return nil, err
	}
	if !apiVersion.MatchString(version.APIVersion) {
		return nil, errors.New("invalid Docker API version")
	}
	filters := url.QueryEscape(`{"label":["hakubutsukan.enable=true"]}`)
	var containers []container
	err := getJSON(ctx, d.client, "http://docker/v"+version.APIVersion+"/containers/json?all=1&filters="+filters, &containers)
	if err != nil {
		return nil, err
	}
	return exhibitsFrom(containers), nil
}

type store struct {
	sync.RWMutex
	catalog Catalog
}

func (s *store) update(ctx context.Context, load func(context.Context) ([]Exhibit, error)) {
	exhibits, err := load(ctx)
	s.Lock()
	defer s.Unlock()
	if err != nil {
		log.Printf("catalog refresh failed: %v", err)
		s.catalog.Stale = true
		s.catalog.Message = "サービス情報を更新できません。接続を確認しています。"
		return
	}
	s.catalog.Exhibits = exhibits
	s.catalog.UpdatedAt = time.Now().UTC()
	s.catalog.Stale = false
	s.catalog.Message = ""
}

func jsonResponse(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("response: %v", err)
	}
}

func routes(s *store, collector bool) http.Handler {
	mux := http.NewServeMux()
	path := "GET /api/catalog"
	if collector {
		path = "GET /catalog"
	}
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) { s.RLock(); defer s.RUnlock(); jsonResponse(w, s.catalog) })
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok\n")) })
	if !collector {
		previews, _ := fs.Sub(assets, "web/previews")
		if dir := os.Getenv("PREVIEW_DIR"); dir != "" {
			previews = os.DirFS(dir)
		}
		previewFiles := http.StripPrefix("/previews/", http.FileServer(http.FS(previews)))
		mux.HandleFunc("GET /previews/", func(w http.ResponseWriter, r *http.Request) {
			if previewURL(r.URL.Path) == "" {
				http.NotFound(w, r)
				return
			}
			previewFiles.ServeHTTP(w, r)
		})
		root, _ := fs.Sub(assets, "web")
		files := http.FileServer(http.FS(root))
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/" && r.URL.Path != "/app.js" && r.URL.Path != "/style.css" && r.URL.Path != "/list.html" && r.URL.Path != "/museum.css" && r.URL.Path != "/museum.bundle.js" {
				http.NotFound(w, r)
				return
			}
			files.ServeHTTP(w, r)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src "+previewFrameSources(s.catalog.PreviewOrigins)+"; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		mux.ServeHTTP(w, r)
	})
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://127.0.0.1" + env("LISTEN_ADDR", ":8080") + "/healthz")
		if err != nil {
			os.Exit(1)
		}
		resp.Body.Close()
		if resp.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	collector := len(os.Args) > 1 && os.Args[1] == "collector"
	demo := os.Getenv("DEMO_MODE") == "true"
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	origins, err := previewOrigins(os.Getenv("PREVIEW_ORIGINS"))
	if err != nil {
		log.Fatal(err)
	}
	s := &store{catalog: Catalog{Exhibits: []Exhibit{}, DockgeURL: webURL(os.Getenv("DOCKGE_URL")), Demo: demo, PreviewOrigins: origins}}
	var load func(context.Context) ([]Exhibit, error)
	if demo {
		load = func(context.Context) ([]Exhibit, error) { return demoExhibits(), nil }
	} else if collector {
		d := newDockerSource(env("DOCKER_SOCKET", "/var/run/docker.sock"))
		load = d.load
	} else {
		client := &http.Client{Timeout: 10 * time.Second}
		endpoint := strings.TrimRight(env("COLLECTOR_URL", "http://collector:8080"), "/") + "/catalog"
		load = func(ctx context.Context) ([]Exhibit, error) {
			var c Catalog
			if err := getJSON(ctx, client, endpoint, &c); err != nil {
				return nil, err
			}
			if c.Stale {
				return nil, errors.New("collector data is stale")
			}
			return c.Exhibits, nil
		}
	}
	if !collector {
		source := load
		load = func(ctx context.Context) ([]Exhibit, error) {
			exhibits, err := source(ctx)
			if err != nil {
				return nil, err
			}
			return permittedPreviews(exhibits, origins), nil
		}
	}
	s.update(ctx, load)
	interval, err := time.ParseDuration(env("REFRESH_INTERVAL", "15s"))
	if err != nil || interval < time.Second {
		log.Fatal("REFRESH_INTERVAL must be at least 1s")
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.update(ctx, load)
			}
		}
	}()
	server := &http.Server{Addr: env("LISTEN_ADDR", ":8080"), Handler: routes(s, collector), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Printf("hakubutsukan listening on %s (collector=%v demo=%v)", server.Addr, collector, demo)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func demoExhibits() []Exhibit {
	return []Exhibit{
		{ID: "demo/animekan", Name: "アニメ館", Category: "エンタメ", Icon: "映", State: "running", Health: "none", Order: 10},
		{ID: "demo/hanafudakan", Name: "花札館", URL: webURL(os.Getenv("DEMO_HANAFUDAKAN_URL")), Category: "ゲーム", Icon: "花", State: "running", Health: "healthy", Order: 20},
		{ID: "demo/gourmetkan", Name: "グルメ館", Description: "ご飯屋さんを共有するアプリ。画面はローカル起動時のサンプルです。", URL: webURL(os.Getenv("DEMO_GOURMETKAN_URL")), Preview: "/previews/gourmetkan.png", PreviewURL: webURL(os.Getenv("DEMO_GOURMETKAN_URL")), Category: "暮らし", Icon: "食", State: "running", Health: "none", Order: 30},
		{ID: "demo/aquarium", Name: "プロセス水族館", Category: "ツール", Icon: "泳", State: "running", Health: "healthy", Order: 40},
		{ID: "demo/hedgedoc", Name: "HedgeDoc", Category: "ツール", Icon: "記", State: "exited", Health: "none", Order: 50},
	}
}
