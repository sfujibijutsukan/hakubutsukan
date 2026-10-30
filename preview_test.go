package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreviewOriginsAndFiltering(t *testing.T) {
	origins, err := previewOrigins("http://localhost:8091, https://APP.example.test:443/")
	if err != nil || len(origins) != 2 || origins[1] != "https://app.example.test" {
		t.Fatalf("origins=%v err=%v", origins, err)
	}
	for _, value := range []string{"*", "http://localhost:8091/path", "https://user:pass@example.test", "https://example.test; frame-src *", "https://*.example.test"} {
		if _, err := previewOrigins(value); err == nil {
			t.Errorf("accepted unsafe origin %q", value)
		}
	}
	got := permittedPreviews([]Exhibit{{PreviewURL: "http://localhost:8091/"}, {PreviewURL: "http://localhost:8092/"}, {PreviewURL: "javascript:alert(1)"}}, origins)
	if got[0].PreviewURL == "" || got[1].PreviewURL != "" || got[2].PreviewURL != "" {
		t.Fatalf("filtering: %+v", got)
	}
	if permittedPreviews([]Exhibit{{PreviewURL: "http://localhost:8091/"}}, nil)[0].PreviewURL != "" {
		t.Fatal("previews must be opt-in")
	}
}

func TestFramePolicy(t *testing.T) {
	for _, origins := range [][]string{nil, {"http://localhost:8091"}} {
		s := &store{catalog: Catalog{PreviewOrigins: origins}}
		w := httptest.NewRecorder()
		routes(s, false).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		csp := w.Header().Get("Content-Security-Policy")
		if !strings.Contains(csp, "frame-src "+previewFrameSources(origins)+";") {
			t.Fatalf("bad iframe policy %s", csp)
		}
		if !strings.Contains(csp, "frame-ancestors 'none'") {
			t.Fatal("parent framing protection was relaxed")
		}
	}
}
