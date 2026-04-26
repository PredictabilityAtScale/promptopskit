import { describe, expect, it } from 'vitest';
import {
  createHardcodedPromptResponder,
  getHardcodedPromptResponse,
  getPromptTestCase,
  parsePromptTestSidecar,
  renderPromptTestCase,
} from '../src/testing.js';

describe('testing helpers', () => {
  it('parses sidecar cases with variables and hardcoded responses', () => {
    const sidecar = parsePromptTestSidecar<{ message: string }>(`
cases:
  - name: basic
    variables:
      name: "World"
    response:
      message: "Hello, World!"
`);

    expect(getPromptTestCase(sidecar, 'basic').variables).toEqual({ name: 'World' });
    expect(getHardcodedPromptResponse(sidecar, 'basic')).toEqual({ message: 'Hello, World!' });
  });

  it('creates a reusable hardcoded responder', () => {
    const responder = createHardcodedPromptResponder([
      {
        name: 'basic',
        response: 'canned output',
      },
    ]);

    expect(responder('basic')).toBe('canned output');
  });

  it('renders a prompt with variables from a sidecar case', async () => {
    const kit = {
      renderPrompt: async (options: unknown) => options,
    };

    const result = await renderPromptTestCase(kit, {
      sidecar: {
        cases: [
          {
            name: 'basic',
            variables: { name: 'World' },
            response: 'Hello, World!',
          },
        ],
      },
      caseName: 'basic',
      path: 'hello',
      provider: 'openai',
      environment: 'dev',
      strict: true,
    });

    expect(result.rendered).toEqual({
      path: 'hello',
      provider: 'openai',
      environment: 'dev',
      tier: undefined,
      variables: { name: 'World' },
      strict: true,
    });
    expect(result.response).toBe('Hello, World!');
  });
});
