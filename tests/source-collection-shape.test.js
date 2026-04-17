import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceCollectionShape } from '../lib/utils/source-collection-shape.ts';

test('detects progressive snapshot collections from numbered labels', () => {
  const shape = analyzeSourceCollectionShape([
    { label: 's01_agent_loop.ts' },
    { label: 's02_tool_use.ts' },
    { label: 's03_todo_write.ts' },
    { label: 'shared.ts' },
  ]);

  assert.equal(shape.mode, 'progressive_snapshots');
  assert.deepEqual(shape.orderedLabels, [
    's01_agent_loop.ts',
    's02_tool_use.ts',
    's03_todo_write.ts',
  ]);
});

test('treats ordinary multi-file inputs as codebase files', () => {
  const shape = analyzeSourceCollectionShape([
    { label: 'app/page.tsx' },
    { label: 'components/button.tsx' },
    { label: 'lib/utils.ts' },
  ]);

  assert.equal(shape.mode, 'codebase_files');
  assert.equal(shape.progressiveLabels.length, 0);
});

test('does not classify generic versioned paths as progressive snapshots', () => {
  const shape = analyzeSourceCollectionShape([
    { label: 'packages/v1/client.ts' },
    { label: 'packages/v2/server.ts' },
    { label: 'packages/v3/shared.ts' },
  ]);

  assert.equal(shape.mode, 'codebase_files');
});
