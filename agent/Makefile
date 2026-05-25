VERSION ?= 0.1.0
LDFLAGS := -ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: build test clean install release-snapshot

build:
	go build $(LDFLAGS) -o bin/deepcodex ./cmd/deepcodex

test:
	go test ./...

clean:
	rm -rf bin/ dist/

install:
	go install $(LDFLAGS) ./cmd/deepcodex

release-snapshot:
	goreleaser release --snapshot --clean
