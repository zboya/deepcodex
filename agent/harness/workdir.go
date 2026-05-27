package harness

import (
	"os"
	"path/filepath"
)

func getDefaultWorkDir() string {
	home, _ := os.UserHomeDir()
	defaultDir := filepath.Join(home, "deepcodex")
	os.MkdirAll(defaultDir, os.ModePerm)
	return defaultDir
}
