import OpenAI from 'openai';

/**
 * TerraPilot → Qwen Cloud integration.
 *
 * The agent talks to Qwen Cloud via Alibaba Cloud DashScope's OpenAI-compatible
 * endpoint. The Base URL below is the official Qwen Cloud endpoint listed in the
 * hackathon "Proof of Deployment" requirements:
 *
 *   Qwen Cloud Base URL: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *
 * (Token Plan equivalent: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1)
 */
const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export function getQwenClient(): OpenAI {
  const apiKey = process.env.QWEN_API_KEY;
  const baseURL = process.env.QWEN_BASE_URL || DEFAULT_BASE_URL;
  return new OpenAI({ apiKey: apiKey || 'missing', baseURL });
}

export function getQwenModel(): string {
  return process.env.QWEN_MODEL || 'qwen-max';
}

export function isQwenConfigured(): boolean {
  return Boolean(process.env.QWEN_API_KEY);
}
