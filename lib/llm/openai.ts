/**
 * OpenAI 兼容 API Provider 实现
 *
 * 支持所有 OpenAI 兼容端点（OpenAI / Azure / 本地 Ollama 等）
 */

import type { LLMProvider, LLMMessage, LLMResponse, LLMChatOptions } from './provider';

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.defaultModel || 'gpt-4o';

    const response = await fetch(this.config.baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.config.apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json'
          ? { type: 'json_object' }
          : undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error('OpenAI API 错误 (' + response.status + '): ' + errorBody);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
