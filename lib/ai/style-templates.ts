/**
 * Generation style templates for tutorial creation.
 * Each style injects different pedagogical framing into the AI prompts.
 */

export interface StyleTemplate {
  id: string
  label: string
  description: string
  promptInjection: string
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'conversational',
    label: '对话式',
    description: '像朋友聊天一样讲解代码，语气轻松自然',
    promptInjection:
      'Use a conversational, friendly tone. Explain concepts as if talking to a colleague. Use everyday analogies and metaphors. Paragraphs should feel like natural speech.',
  },
  {
    id: 'textbook',
    label: '教科书式',
    description: '结构化的知识传授，严谨、系统、有层次',
    promptInjection:
      'Use a structured, textbook-style exposition. Start each step with a clear concept definition, followed by code demonstration, then summarize key takeaways. Use formal but accessible language.',
  },
  {
    id: 'progressive',
    label: '渐进式',
    description: '从简单到复杂，每步建立在上一步的认知基础上',
    promptInjection:
      'Use a progressive disclosure approach. Each step should build directly on the understanding from the previous step. Start with the simplest concept and gradually introduce complexity. Make sure each step feels like a natural evolution, not a jump.',
  },
]
