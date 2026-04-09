/**
 * Test v2 multi-phase generation with mini-redux.js
 * Usage: node scripts/test-generation.mjs
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:3000';

async function main() {
  const sourceCode = readFileSync('docs/mini-redux.js', 'utf8');

  // Step 1: Create draft
  console.log('=== Step 1: Creating draft ===');
  const createPayload = {
    sourceItems: [{
      id: '550e8400-e29b-41d4-a716-446655440001',
      kind: 'snippet',
      label: 'Redux 核心源码',
      language: 'javascript',
      content: sourceCode,
    }],
    teachingBrief: {
      topic: 'Redux 核心源码实现',
      audience_level: 'intermediate',
      core_question: 'Redux 的 createStore、combineReducers、bindActionCreators、applyMiddleware、compose 这五个核心 API 是如何实现的？',
      ignore_scope: 'React-Redux 绑定、异步中间件（redux-thunk）、性能优化',
      output_language: '中文',
      desired_depth: 'deep',
      target_step_count: 12,
      preferred_style: 'Build Your Own Redux 风格，从零构建，先让最小功能跑起来，再逐步指出不足并引入新概念修正',
    },
  };

  const createRes = await fetch(`${BASE_URL}/api/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    console.error('Create failed:', createRes.status, await createRes.text());
    process.exit(1);
  }

  const draft = await createRes.json();
  const draftId = draft.id;
  console.log('Draft ID:', draftId);

  // Step 2: Trigger v2 generation
  console.log('\n=== Step 2: Triggering v2 generation ===');
  const genRes = await fetch(`${BASE_URL}/api/drafts/${draftId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationVersion: 'v2' }),
  });

  if (!genRes.ok) {
    console.error('Generation failed:', genRes.status, await genRes.text());
    process.exit(1);
  }

  // Read SSE stream
  const reader = genRes.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let allEvents = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        allEvents.push({ event: currentEvent, data });
        if (currentEvent === 'phase') {
          if (data.phase === 'outline') console.log('  [outline] started...');
          else if (data.phase === 'step-fill') console.log(`  [step-fill] ${data.stepIndex + 1}/${data.totalSteps}...`);
          else if (data.phase === 'validate') console.log('  [validate] started...');
          else if (data.phase === 'fallback') console.log('  [fallback] to v1:', data.reason);
        } else if (currentEvent === 'outline') {
          console.log(`  [outline] received: ${data.steps?.length} steps`);
        } else if (currentEvent === 'step') {
          console.log(`  [step] ${data.stepIndex}: ${data.step?.title}`);
        } else if (currentEvent === 'validation') {
          console.log(`  [validation] valid=${data.valid}, errors=${data.errors?.length}`);
        } else if (currentEvent === 'done') {
          console.log('  [done]');
        } else if (currentEvent === 'error') {
          console.log('  [error]', data.message);
        } else if (data.text) {
          process.stdout.write('.');
        } else if (data.done) {
          console.log('  [v1 done]');
        }
      } catch {}
    }
  }

  // Step 3: Wait for persistence and fetch result
  console.log('\n=== Step 3: Waiting for persistence ===');
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const checkRes = await fetch(`${BASE_URL}/api/drafts/${draftId}`);
    const checkData = await checkRes.json();
    if (checkData.generationState === 'succeeded') {
      console.log('Generation succeeded!');
      await evaluateResult(checkData);
      return;
    } else if (checkData.generationState === 'failed') {
      console.log('Generation failed:', checkData.generationErrorMessage);
      console.log('Validation errors:', JSON.stringify(checkData.validationErrors, null, 2));
      process.exit(1);
    }
    process.stdout.write('.');
  }
  console.log('\nTimeout waiting for persistence');
}

async function evaluateResult(data) {
  console.log('\n=== Evaluation ===');
  console.log('Title:', data.tutorialDraft?.meta?.title);
  console.log('Steps:', data.tutorialDraft?.steps?.length);

  if (data.generationQuality) {
    console.log('\nQuality Metrics:');
    console.log(JSON.stringify(data.generationQuality, null, 2));
  }

  if (data.generationOutline) {
    console.log('\n=== Outline ===');
    data.generationOutline.steps?.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title}`);
      console.log(`     Goal: ${s.teachingGoal}`);
      console.log(`     Concept: ${s.conceptIntroduced} (est ${s.estimatedLocChange} LOC)`);
    });
  }

  if (data.tutorialDraft?.steps) {
    console.log('\n=== Step Details ===');
    data.tutorialDraft.steps.forEach((s, i) => {
      const patchCount = s.patches?.length || 0;
      const locChange = s.patches?.reduce((sum, p) => {
        return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
      }, 0) || 0;
      const proseLen = s.paragraphs?.reduce((sum, p) => sum + p.length, 0) || 0;
      console.log(`  Step ${i + 1}: ${s.title}`);
      console.log(`    Patches: ${patchCount}, LOC change: ~${locChange}, Prose: ${proseLen} chars`);
      console.log(`    TeachingGoal: ${s.teachingGoal || '(none)'}`);
      // Show first paragraph
      if (s.paragraphs?.[0]) {
        console.log(`    First paragraph: ${s.paragraphs[0].slice(0, 120)}...`);
      }
    });
  }

  // Save full result for detailed inspection
  writeFileSync('/tmp/v2-generation-result.json', JSON.stringify(data, null, 2));
  console.log('\nFull result saved to /tmp/v2-generation-result.json');
}

main().catch(e => { console.error(e); process.exit(1); });
