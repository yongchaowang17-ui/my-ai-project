/**
 * LLM Provider 工厂
 *
 * 根据环境变量创建对应的 Provider 实例
 */

import type { LLMProvider } from './provider';
import { OpenAIProvider } from './openai';

export function createProvider(): LLMProvider | null {
  const providerType = process.env.LLM_PROVIDER || 'none';

  switch (providerType) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
        defaultModel: process.env.OPENAI_MODEL || 'gpt-4o',
      });

    // 后续扩展：case 'dify': ...
    // 后续扩展：case 'ollama': ...

    default:
      return null;
  }
}

export type { LLMProvider, LLMMessage, LLMResponse, LLMChatOptions } from './provider';
