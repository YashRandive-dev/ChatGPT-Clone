import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { normaliseOpenAIError } from '../src/services/ai/openaiProvider';

const apiError = (status: number, body: Record<string, string>) => OpenAI.APIError.generate(status, { error: body }, body.message, new Headers());

describe('OpenAI error mapping', () => {
  it('reports an exhausted credit balance as a billing problem, not a rate limit', () => {
    for (const body of [
      { code: 'credit_balance_exhausted', type: 'insufficient_quota', message: 'You have no credits remaining.' },
      { code: 'insufficient_quota', type: 'insufficient_quota', message: 'You exceeded your current quota.' },
    ]) {
      const e = normaliseOpenAIError(apiError(429, body));
      expect(e.code).toBe('AI_QUOTA');
      expect(e.message).toMatch(/run out of credits/);
    }
  });

  it('keeps real rate limits as rate limits', () => {
    const e = normaliseOpenAIError(apiError(429, { code: 'rate_limit_exceeded', type: 'requests', message: 'Rate limit reached' }));
    expect(e.code).toBe('AI_RATE_LIMIT');
  });

  it('tells a wrong API address apart from a missing model', () => {
    const e = normaliseOpenAIError(apiError(404, { code: '', type: '', message: 'Not Found' }));
    expect(e.code).toBe('AI_UNAVAILABLE');
    expect(e.message).toMatch(/OPENAI_BASE_URL/);
    expect(normaliseOpenAIError(apiError(404, { code: '', type: 'invalid_request_error', message: 'The model `x` does not exist' })).code).toBe('MODEL_UNAVAILABLE');
  });

  it('maps unknown models and bad keys', () => {
    expect(normaliseOpenAIError(apiError(404, { code: 'model_not_found', type: 'invalid_request_error', message: 'nope' })).code).toBe('MODEL_UNAVAILABLE');
    expect(normaliseOpenAIError(apiError(401, { code: 'invalid_api_key', type: 'invalid_request_error', message: 'bad key' })).code).toBe('AI_AUTH');
  });
});
