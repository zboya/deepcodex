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

export interface ChatToolCall {
  id: string;
  name: string;
  /** 流式拼接中的 JSON 参数字符串 */
  args: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: number;
  streaming?: boolean; // 是否正在流式接收中
  toolCalls?: ChatToolCall[];
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
