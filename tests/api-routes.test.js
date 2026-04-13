import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/**
 * Expected API routes and their HTTP method exports.
 * Each entry maps a route path (relative to app/api/) to an array of
 * expected exported function names (e.g. GET, POST).
 */
const expectedRoutes = {
  'drafts/route.ts': ['GET', 'POST'],
  'drafts/[id]/route.ts': ['GET', 'PATCH', 'DELETE'],
  'drafts/[id]/generate/route.ts': ['POST'],
  'drafts/[id]/publish/route.ts': ['POST'],
  'drafts/[id]/unpublish/route.ts': ['POST'],
  'drafts/[id]/payload/route.ts': ['GET'],
  'drafts/[id]/snapshots/route.ts': ['GET', 'POST'],
  'drafts/[id]/snapshots/[snapshotId]/route.ts': ['POST', 'DELETE'],
  'tutorials/[slug]/route.js': ['GET'],
  'og/[slug]/route.tsx': ['GET'],
  'auth/[...nextauth]/route.ts': ['GET', 'POST'],
};

/**
 * Resolve a route's file extension. Some routes may use .js instead of .ts.
 */
function resolveRouteFile(routeRelPath) {
  const fullPath = path.join(repoRoot, 'app', 'api', routeRelPath);
  if (fs.existsSync(fullPath)) return fullPath;
  return null;
}

/**
 * Check that a source file contains an export for the given HTTP method name.
 * Matches:
 *   - `export async function GET(` or `export function POST(`
 *   - `export const { GET, POST } = handlers` (destructuring)
 *   - `export const GET = ...`
 */
function hasExportedMethod(source, method) {
  // export async? function METHOD(
  const funcRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`);
  // export const { ..., METHOD, ... } = ...
  const destructRegex = new RegExp(`export\\s+const\\s*\\{[^}]*\\b${method}\\b[^}]*\\}\\s*=`);
  // export const METHOD =
  const constRegex = new RegExp(`export\\s+const\\s+${method}\\s*=`);

  return funcRegex.test(source) || destructRegex.test(source) || constRegex.test(source);
}

// ── All expected route files exist ──

test('all expected API route files exist', () => {
  const missing = [];

  for (const routeRelPath of Object.keys(expectedRoutes)) {
    const resolved = resolveRouteFile(routeRelPath);
    if (!resolved) {
      missing.push(routeRelPath);
    }
  }

  assert.deepEqual(missing, [], 'all expected route files should exist');
});

// ── Each route file exports the expected HTTP methods ──

for (const [routeRelPath, methods] of Object.entries(expectedRoutes)) {
  const resolved = resolveRouteFile(routeRelPath);

  test(`route ${routeRelPath} exports ${methods.join(', ')}`, () => {
    if (!resolved) {
      assert.fail(`route file not found: ${routeRelPath}`);
    }

    const source = fs.readFileSync(resolved, 'utf8');
    const missing = [];

    for (const method of methods) {
      if (!hasExportedMethod(source, method)) {
        missing.push(method);
      }
    }

    assert.deepEqual(missing, [], `route ${routeRelPath} should export ${methods.join(', ')}`);
  });
}
