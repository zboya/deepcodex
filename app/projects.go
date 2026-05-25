package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// ProjectEntry 持久化存储的项目条目
type ProjectEntry struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

// projectsStore 管理本地项目列表的持久化
type projectsStore struct {
	configPath string
}

func newProjectsStore() *projectsStore {
	home, _ := os.UserHomeDir()
	return &projectsStore{
		configPath: filepath.Join(home, ".deepcodex", "projects.json"),
	}
}

func (s *projectsStore) load() ([]ProjectEntry, error) {
	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []ProjectEntry{}, nil
		}
		return nil, err
	}
	var list []ProjectEntry
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *projectsStore) save(list []ProjectEntry) error {
	if err := os.MkdirAll(filepath.Dir(s.configPath), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.configPath, data, 0o644)
}

// Projects 暴露给前端的项目管理模块
type Projects struct {
	store *projectsStore
}

// NewProjects 创建项目管理实例
func NewProjects() *Projects {
	return &Projects{store: newProjectsStore()}
}

// ListProjects 列出所有已添加的项目
func (p *Projects) ListProjects() []ProjectEntry {
	list, err := p.store.load()
	if err != nil {
		return []ProjectEntry{}
	}
	// 按创建时间降序
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt > list[j].CreatedAt
	})
	return list
}

// AddProject 添加一个本地目录作为项目
// name 可为空，若空则使用目录名
func (p *Projects) AddProject(dirPath string, name string) (ProjectEntry, error) {
	// 检查目录是否存在
	info, err := os.Stat(dirPath)
	if err != nil {
		return ProjectEntry{}, fmt.Errorf("目录不存在或无法访问: %w", err)
	}
	if !info.IsDir() {
		return ProjectEntry{}, fmt.Errorf("%s 不是一个目录", dirPath)
	}

	// 规范化路径
	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return ProjectEntry{}, err
	}

	list, err := p.store.load()
	if err != nil {
		return ProjectEntry{}, err
	}

	// 检查是否重复添加
	for _, item := range list {
		if item.Path == absPath {
			return ProjectEntry{}, fmt.Errorf("项目 %s 已存在", absPath)
		}
	}

	if name == "" {
		name = filepath.Base(absPath)
	}

	entry := ProjectEntry{
		ID:        fmt.Sprintf("proj-%d", time.Now().UnixNano()),
		Name:      name,
		Path:      absPath,
		CreatedAt: time.Now().Unix(),
	}

	list = append(list, entry)
	if err := p.store.save(list); err != nil {
		return ProjectEntry{}, err
	}
	return entry, nil
}

// DeleteProject 删除一个项目（不删除目录本身）
func (p *Projects) DeleteProject(id string) error {
	list, err := p.store.load()
	if err != nil {
		return err
	}

	newList := list[:0]
	found := false
	for _, item := range list {
		if item.ID == id {
			found = true
			continue
		}
		newList = append(newList, item)
	}

	if !found {
		return fmt.Errorf("项目 %s 不存在", id)
	}

	return p.store.save(newList)
}

// RenameProject 重命名项目
func (p *Projects) RenameProject(id string, newName string) error {
	if newName == "" {
		return fmt.Errorf("项目名称不能为空")
	}
	list, err := p.store.load()
	if err != nil {
		return err
	}
	found := false
	for i := range list {
		if list[i].ID == id {
			list[i].Name = newName
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("项目 %s 不存在", id)
	}
	return p.store.save(list)
}

// GetProject 根据 ID 获取项目信息
func (p *Projects) GetProject(id string) (ProjectEntry, error) {
	list, err := p.store.load()
	if err != nil {
		return ProjectEntry{}, err
	}
	for _, item := range list {
		if item.ID == id {
			return item, nil
		}
	}
	return ProjectEntry{}, fmt.Errorf("项目 %s 不存在", id)
}

// SelectDirectory 打开原生目录选择对话框，返回用户选择的目录路径
// 此方法需要在 App 层调用 runtime.OpenDirectoryDialog，这里仅作占位
// 实际对话框调用在 app.go 中的 App 结构体方法里
func (p *Projects) GetSessionsDir(projectPath string) string {
	return filepath.Join(projectPath, ".port_sessions")
}
