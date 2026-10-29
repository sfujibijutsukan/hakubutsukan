package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestExhibitsSelectionAndURL(t *testing.T) {
	base := map[string]string{"hakubutsukan.enable": "true", "com.docker.compose.project": "test", "com.docker.compose.service": "app", "caddy": "app.example.test"}
	containers := []container{
		{ID: "db", Labels: map[string]string{"com.docker.compose.service": "db"}},
		{ID: "app", Labels: base, State: "running", Status: "Up 1 hour (healthy)"},
	}
	got := exhibitsFrom(containers)
	if len(got) != 1 || got[0].URL != "https://app.example.test" || got[0].ID != "test/app" || got[0].Health != "healthy" {
		t.Fatalf("unexpected exhibits: %+v", got)
	}
	for _, raw := range []string{"javascript:alert(1)", "//example.test", "https://user:pass@example.test", ""} {
		base["hakubutsukan.url"] = raw
		if got := exhibitsFrom(containers)[0].URL; got != "" {
			t.Errorf("unsafe or explicitly blank URL %q accepted as %q", raw, got)
		}
	}
	base["hakubutsukan.url"] = "http://192.168.1.10:5000/path"
	if got := exhibitsFrom(containers)[0].URL; got != base["hakubutsukan.url"] {
		t.Fatal(got)
	}
	delete(base, "hakubutsukan.url")
	for _, raw := range []string{"a.example.test, b.example.test", ":443", "*.example.test", "app.example.test/path"} {
		base["caddy"] = raw
		if exhibitsFrom(containers)[0].URL != "" {
			t.Errorf("ambiguous Caddy label accepted: %q", raw)
		}
	}
}

func TestReplicasAndOrder(t *testing.T) {
	makeContainer := func(service, state, status, order string) container {
		return container{Labels: map[string]string{"hakubutsukan.enable": "true", "com.docker.compose.project": "p", "com.docker.compose.service": service, "hakubutsukan.order": order}, State: state, Status: status}
	}
	got := exhibitsFrom([]container{makeContainer("a", "running", "(healthy)", "20"), makeContainer("b", "running", "(unhealthy)", "10"), makeContainer("a", "exited", "Exited", "20")})
	if len(got) != 2 || got[0].ID != "p/b" || got[0].Health != "unhealthy" || got[1].State != "exited" {
		t.Fatalf("unexpected grouping: %+v", got)
	}
}

func TestStalePreservesDataAndRecovers(t *testing.T) {
	s := &store{}
	s.update(context.Background(), func(context.Context) ([]Exhibit, error) { return []Exhibit{{ID: "a"}}, nil })
	updated := s.catalog.UpdatedAt
	s.update(context.Background(), func(context.Context) ([]Exhibit, error) { return nil, errors.New("private upstream error") })
	if !s.catalog.Stale || len(s.catalog.Exhibits) != 1 || !s.catalog.UpdatedAt.Equal(updated) || strings.Contains(s.catalog.Message, "private") {
		t.Fatalf("bad stale handling: %+v", s.catalog)
	}
	s.update(context.Background(), func(context.Context) ([]Exhibit, error) { return []Exhibit{}, nil })
	if s.catalog.Stale || s.catalog.Message != "" || len(s.catalog.Exhibits) != 0 {
		t.Fatal("did not recover")
	}
}

func TestDockerSocketProtocol(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "docker.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("unexpected mutation: %s", r.Method)
		}
		switch r.URL.Path {
		case "/version":
			json.NewEncoder(w).Encode(map[string]string{"ApiVersion": "1.56"})
		case "/v1.56/containers/json":
			if r.URL.Query().Get("all") != "1" || !strings.Contains(r.URL.Query().Get("filters"), "hakubutsukan.enable=true") {
				t.Error("missing selection filters")
			}
			json.NewEncoder(w).Encode([]container{{ID: "x", Names: []string{"/app"}, Labels: map[string]string{"hakubutsukan.enable": "true", "secret": "never publish"}, State: "running"}})
		default:
			t.Errorf("unexpected Docker path %s", r.URL.Path)
			http.NotFound(w, r)
		}
	})}
	go server.Serve(listener)
	defer server.Close()
	got, err := newDockerSource(socket).load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(got)
	if len(got) != 1 || strings.Contains(string(raw), "secret") {
		t.Fatalf("unexpected public data: %s", raw)
	}
}

func TestPublicRoutes(t *testing.T) {
	s := &store{catalog: Catalog{Exhibits: []Exhibit{}}}
	for _, collector := range []bool{false, true} {
		handler := routes(s, collector)
		for _, path := range []string{"/containers/json", "/version", "/main.go", "/.env"} {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest("GET", path, nil))
			if recorder.Code != 404 {
				t.Errorf("exposed %s: %d", path, recorder.Code)
			}
		}
		path := "/api/catalog"
		if collector {
			path = "/catalog"
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest("GET", path, nil))
		if recorder.Code != 200 || !strings.Contains(recorder.Body.String(), `"exhibits":[]`) || recorder.Header().Get("Content-Security-Policy") == "" {
			t.Fatalf("bad catalog response: %v", recorder)
		}
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest("POST", path, nil))
		if recorder.Code != 405 {
			t.Fatalf("POST allowed: %d", recorder.Code)
		}
	}
}
