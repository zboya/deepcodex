package app

import (
	"github.com/zboya/deepcodex/agent/harness"
	"github.com/zboya/deepcodex/agent/skills"
)

// Skills provides skill listing for the frontend.
type Skills struct {
	h *harness.Harness
}

// NewSkills creates a new Skills instance with the given harness.
func NewSkills(h *harness.Harness) *Skills {
	return &Skills{h: h}
}

// SkillItem represents a skill entry for frontend display.
type SkillItem struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ToolPerms   []string `json:"toolPerms,omitempty"`
}

// List returns all available skills (built-in + user-defined).
func (s *Skills) List() []SkillItem {
	if s.h == nil {
		return []SkillItem{}
	}
	loaded := s.h.ListSkills()
	return toSkillItems(loaded)
}

func toSkillItems(loaded []skills.Skill) []SkillItem {
	items := make([]SkillItem, 0, len(loaded))
	for _, sk := range loaded {
		desc := sk.SystemPrompt
		// Truncate long system prompts for display
		if len(desc) > 120 {
			desc = desc[:120] + "..."
		}
		items = append(items, SkillItem{
			ID:          sk.Name,
			Name:        sk.Name,
			Description: desc,
			ToolPerms:   sk.ToolPerms,
		})
	}
	return items
}
