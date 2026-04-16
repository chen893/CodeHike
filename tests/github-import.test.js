import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSubdirectoryIntoTree } from '../components/create-draft/github-client.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('GitHub routes allow anonymous public-repo access and reuse token only when present', () => {
  const repoTreeRoute = read('app/api/github/repo-tree/route.ts');
  const fileContentRoute = read('app/api/github/file-content/route.ts');

  assert.match(repoTreeRoute, /session\?\.user\?\.id \? await getGitHubTokenForUser\(session\.user\.id\) : null/);
  assert.doesNotMatch(repoTreeRoute, /UNAUTHORIZED/);
  assert.match(fileContentRoute, /session\?\.user\?\.id \? await getGitHubTokenForUser\(session\.user\.id\) : null/);
  assert.doesNotMatch(fileContentRoute, /UNAUTHORIZED/);
});

test('GitHub file-content route keeps successful files in partial-failure responses', () => {
  const fileContentRoute = read('app/api/github/file-content/route.ts');

  assert.match(fileContentRoute, /const payload = serializeGitHubFileBatchResult/);
  assert.match(fileContentRoute, /code: 'PARTIAL_FAILURE'/);
  assert.match(fileContentRoute, /\.\.\.payload/);
});

test('mergeSubdirectoryIntoTree replaces lazy directory children in place', () => {
  const merged = mergeSubdirectoryIntoTree(
    [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        sha: 'src-sha',
        children: [],
      },
    ],
    'src',
    [
      {
        name: 'app.ts',
        path: 'src/app.ts',
        type: 'file',
        size: 10,
        children: [],
      },
    ],
  );

  assert.equal(merged[0].children.length, 1);
  assert.equal(merged[0].children[0].path, 'src/app.ts');
});

test('mergeSubdirectoryIntoTree unwraps API subtree root when present', () => {
  const merged = mergeSubdirectoryIntoTree(
    [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        sha: 'src-sha',
        children: [],
      },
    ],
    'src',
    [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        sha: 'src-sha',
        children: [
          {
            name: 'app.ts',
            path: 'src/app.ts',
            type: 'file',
            size: 10,
            children: [],
          },
        ],
      },
    ],
  );

  assert.equal(merged[0].children.length, 1);
  assert.equal(merged[0].children[0].path, 'src/app.ts');
  assert.notEqual(merged[0].children[0].path, 'src');
});
