// 通用类型定义
export interface Project {
  id: string;
  name: string;
}

export interface ChatItem {
  id: string;
  title: string;
  createdAt?: number;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  iconColor: string;
}
