import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const appDir = path.join(repoRoot, 'app');
const appFilePattern = /\.(js|jsx|ts|tsx)$/;
const importPattern =
  /\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const forbiddenImportPatterns = [
  /^@\/lib\/repositories\//,
  /^@\/lib\/db\//,
  /^@\/lib\/tutorial\//,
  /^@\/lib\/tutorial-(assembler|payload|registry|draft-code)/,
];

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }

    return appFilePattern.test(entry.name) ? [fullPath] : [];
  });
}

test('app routes only depend on service and component boundaries', () => {
  const violations = [];

  for (const filePath of collectFiles(appDir)) {
    const relativePath = path.relative(repoRoot, filePath);
    const source = fs.readFileSync(filePath, 'utf8');

    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;

      if (forbiddenImportPatterns.some((pattern) => pattern.test(specifier))) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
