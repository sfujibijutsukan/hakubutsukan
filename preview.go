package main

import (
	"fmt"
	"net/url"
	"strings"
)

// Embedding is opt-in and restricted to exact browser origins, never wildcard hosts.
func previewOrigins(raw string) ([]string, error) {
	result := make([]string, 0)
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		u, err := url.Parse(entry)
		if err != nil || webURL(entry) == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(u.Host, " *;'\t\r\n") {
			return nil, fmt.Errorf("PREVIEW_ORIGINS must contain comma-separated HTTP(S) origins")
		}
		origin := browserOrigin(u)
		exists := false
		for _, item := range result {
			if item == origin {
				exists = true
			}
		}
		if !exists {
			result = append(result, origin)
		}
	}
	return result, nil
}

func browserOrigin(u *url.URL) string {
	host := strings.ToLower(u.Host)
	if (u.Scheme == "http" && u.Port() == "80") || (u.Scheme == "https" && u.Port() == "443") {
		host = strings.TrimSuffix(host, ":"+u.Port())
	}
	return u.Scheme + "://" + host
}

func permittedPreviews(exhibits []Exhibit, origins []string) []Exhibit {
	for i := range exhibits {
		candidate := webURL(exhibits[i].PreviewURL)
		exhibits[i].PreviewURL = ""
		if candidate == "" {
			continue
		}
		u, _ := url.Parse(candidate)
		for _, allowed := range origins {
			if browserOrigin(u) == allowed {
				exhibits[i].PreviewURL = candidate
				break
			}
		}
	}
	return exhibits
}

func previewFrameSources(origins []string) string {
	if len(origins) == 0 {
		return "'none'"
	}
	return strings.Join(origins, " ")
}
