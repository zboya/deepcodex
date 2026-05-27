package app

import (
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/agent/mcpclient"
)

// MCP provides MCP server listing for the frontend.
type MCP struct {
	h *harness.Harness
}

// NewMCP creates a new MCP instance with the given harness.
func NewMCP(h *harness.Harness) *MCP {
	return &MCP{h: h}
}

// MCPServerItem represents an MCP server entry for frontend display.
type MCPServerItem struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Command     string   `json:"command"`
	ToolCount   int      `json:"toolCount"`
	ToolNames   []string `json:"toolNames,omitempty"`
	Connected   bool     `json:"connected"`
}

// List returns all configured MCP servers with their connection status and tools.
func (m *MCP) List() []MCPServerItem {
	if m.h == nil {
		return []MCPServerItem{}
	}
	servers := m.h.ListMCPServers()
	return toMCPServerItems(servers)
}

func toMCPServerItems(servers []mcpclient.ServerInfo) []MCPServerItem {
	items := make([]MCPServerItem, 0, len(servers))
	for _, s := range servers {
		items = append(items, MCPServerItem{
			ID:          s.Name,
			Name:        s.Name,
			Description: buildMCPDescription(s),
			Command:     s.Command,
			ToolCount:   s.ToolCount,
			ToolNames:   s.ToolNames,
			Connected:   s.Connected,
		})
	}
	return items
}

func buildMCPDescription(s mcpclient.ServerInfo) string {
	if s.ToolCount > 0 {
		return s.Command + " (" + itoa(s.ToolCount) + " tools)"
	}
	return s.Command
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
