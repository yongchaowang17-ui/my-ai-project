/**
 * LLM Provider 抽象接口
 *
 * 所有 LLM 服务实现此接口，方便后续切换 OpenAI / Dify / 本地模型
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  /** 提供商名称 */
  readonly name: string;

  /** 发送聊天请求 */
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse>;
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 响应 JSON 格式 */
  responseFormat?: 'text' | 'json';
}
