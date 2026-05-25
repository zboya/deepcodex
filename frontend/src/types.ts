// 通用类型定义

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt?: number;
}

export interface ChatItem {
  id: string;
  title: string;
  createdAt?: number;
  workingDir?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: number;
  streaming?: boolean; // 是否正在流式接收中
}

export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  iconColor: string;
}

export interface SendOptions {
  continueSession: boolean;
  resumeSessionID?: string;
}
