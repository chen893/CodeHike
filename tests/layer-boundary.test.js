import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const appDir = path.join(repoRoot, 'app');
const componentsDir = path.join(repoRoot, 'components');
const libServicesDir = path.join(repoRoot, 'lib', 'services');
const libDir = path.join(repoRoot, 'lib');
const sourceFilePattern = /\.(js|jsx|ts|tsx)$/;
const importPattern =
  /\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return sourceFilePattern.test(entry.name) ? [fullPath] : [];
  });
}

function extractImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specifiers = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function matchesAny(specifier, patterns) {
  return patterns.some((p) => p.test(specifier));
}

// ── 1. app/ pages must not import from lib/repositories/* ──

test('app pages do not directly import from lib/repositories', () => {
  const forbidden = [/^@\/lib\/repositories\//];
  const violations = [];

  for (const filePath of collectFiles(appDir)) {
    // Skip API routes — they are tested separately
    if (filePath.includes(path.join('app', 'api'))) continue;

    const relativePath = path.relative(repoRoot, filePath);
    for (const specifier of extractImports(filePath)) {
      if (matchesAny(specifier, forbidden)) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, [], 'app pages must go through lib/services, not import repositories directly');
});

// ── 2. app/api/ routes must not directly import from lib/db/* ──

test('app/api routes do not directly import from lib/db', () => {
  const forbidden = [/^@\/lib\/db\//];
  const apiDir = path.join(appDir, 'api');
  const violations = [];

  for (const filePath of collectFiles(apiDir)) {
    const relativePath = path.relative(repoRoot, filePath);
    for (const specifier of extractImports(filePath)) {
      if (matchesAny(specifier, forbidden)) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, [], 'API routes must go through lib/services, not import lib/db directly');
});

// ── 3. components/ must not import from lib/repositories/* ──

test('components do not directly import from lib/repositories', () => {
  const forbidden = [/^@\/lib\/repositories\//];
  const violations = [];

  for (const filePath of collectFiles(componentsDir)) {
    const relativePath = path.relative(repoRoot, filePath);
    for (const specifier of extractImports(filePath)) {
      if (matchesAny(specifier, forbidden)) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, [], 'components must go through lib/services, not import repositories directly');
});

// ── 4. lib/services/ is the only layer that calls lib/repositories/* ──

test('only lib/services imports from lib/repositories', () => {
  const forbidden = [/^@\/lib\/repositories\//];
  const violations = [];

  // Collect all lib/ files except those inside lib/repositories/ and lib/services/
  function collectLibOutsideServices(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip the repositories directory itself and the services directory
        if (entry.name === 'repositories' || entry.name === 'services') return [];
        return collectLibOutsideServices(fullPath);
      }
      return sourceFilePattern.test(entry.name) ? [fullPath] : [];
    });
  }

  for (const filePath of collectLibOutsideServices(libDir)) {
    const relativePath = path.relative(repoRoot, filePath);
    for (const specifier of extractImports(filePath)) {
      if (matchesAny(specifier, forbidden)) {
        violations.push(`${relativePath}: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, [], 'only lib/services should import from lib/repositories');
});
