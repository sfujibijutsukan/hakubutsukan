package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPreviewLabel(t *testing.T) {
	for _, raw := range []string{"/previews/gourmetkan.png", "/previews/app-2_test.webp", "/previews/1.jpg", "/previews/a.jpeg"} {
		c := container{Labels: map[string]string{"hakubutsukan.enable": "true", "hakubutsukan.preview": raw}}
		got := exhibitsFrom([]container{c})
		if len(got) != 1 || got[0].Preview != raw {
			t.Fatalf("preview not propagated: %+v", got)
		}
		data, _ := json.Marshal(Catalog{Exhibits: got})
		var catalog Catalog
		if err := json.Unmarshal(data, &catalog); err != nil || catalog.Exhibits[0].Preview != raw {
			t.Fatalf("preview lost in catalog: %s", data)
		}
	}
	for _, raw := range []string{"", "https://app.test/screenshot.png", "//app.test/a.png", "javascript:alert(1)", "/previews/../main.go", "/previews/a.svg", "/previews/a.html", "/previews/a.png?x=1", "/previews/sub/a.png", "/previews/a.PNG"} {
		if got := previewURL(raw); got != "" {
			t.Errorf("accepted unsafe preview %q", raw)
		}
	}
}

func TestPreviewRoutes(t *testing.T) {
	s := &store{catalog: Catalog{Exhibits: demoExhibits()}}
	for _, collector := range []bool{false, true} {
		handler := routes(s, collector)
		for _, path := range []string{"/previews/gourmetkan.png", "/previews/", "/previews/README.md", "/previews/missing.png", "/previews/a.svg"} {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			want := 404
			if !collector && path == "/previews/gourmetkan.png" {
				want = 200
			}
			if w.Code != want {
				t.Errorf("collector=%v path=%s: %d, want %d", collector, path, w.Code, want)
			}
			if want == 200 && (!strings.HasPrefix(w.Header().Get("Content-Type"), "image/png") || !strings.HasPrefix(w.Body.String(), "\x89PNG")) {
				t.Fatal("preview is not a PNG")
			}
		}
	}
}

func TestCustomPreviewDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "custom.png"), []byte("custom image"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PREVIEW_DIR", dir)
	handler := routes(&store{}, false)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/previews/custom.png", nil))
	if w.Code != 200 || w.Body.String() != "custom image" {
		t.Fatalf("custom preview unavailable: %v", w)
	}
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/previews/gourmetkan.png", nil))
	if w.Code != 404 {
		t.Fatal("custom directory should replace embedded previews")
	}
}

func TestDemoGourmetkan(t *testing.T) {
	for _, raw := range []string{"", "http://127.0.0.1:18081", "javascript:alert(1)"} {
		t.Setenv("DEMO_GOURMETKAN_URL", raw)
		found := false
		for _, e := range demoExhibits() {
			if e.ID == "demo/gourmetkan" {
				found = true
				if e.Preview != "/previews/gourmetkan.png" || e.URL != webURL(raw) {
					t.Fatalf("unexpected demo: %+v", e)
				}
			}
		}
		if !found {
			t.Fatal("missing gourmetkan demo")
		}
	}
}
