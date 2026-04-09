#!/bin/bash
# Test v2 multi-phase generation with mini-redux.js
set -e

BASE_URL="http://localhost:3000"

# Read source code
SOURCE_CODE=$(cat docs/mini-redux.js)

echo "=== Step 1: Creating draft ==="
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/drafts" \
  -H "Content-Type: application/json" \
  -d "$(cat <<'ENDJSON'
{
  "sourceItems": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "kind": "snippet",
      "label": "Redux 核心源码",
      "language": "javascript",
      "content": "SOURCE_PLACEHOLDER"
    }
  ],
  "teachingBrief": {
    "topic": "Redux 核心源码实现",
    "audience_level": "intermediate",
    "core_question": "Redux 的 createStore、combineReducers、bindActionCreators、applyMiddleware、compose 这五个核心 API 是如何实现的？",
    "ignore_scope": "React-Redux 绑定、异步中间件（redux-thunk）、性能优化",
    "output_language": "中文",
    "desired_depth": "deep",
    "target_step_count": 12,
    "preferred_style": "Build Your Own Redux 风格，从零构建，先让最小功能跑起来，再逐步指出不足并引入新概念修正"
  }
}
ENDJSON
)" | sed "s|SOURCE_PLACEHOLDER|$(echo "$SOURCE_CODE" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g')|")

# Actually, let's do this properly with a temp file
echo "$SOURCE_CODE" > /tmp/redux_source.txt

# Create the JSON payload properly using node
node -e "
const fs = require('fs');
const source = fs.readFileSync('/tmp/redux_source.txt', 'utf8');
const payload = {
  sourceItems: [{
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'snippet',
    label: 'Redux 核心源码',
    language: 'javascript',
    content: source
  }],
  teachingBrief: {
    topic: 'Redux 核心源码实现',
    audience_level: 'intermediate',
    core_question: 'Redux 的 createStore、combineReducers、bindActionCreators、applyMiddleware、compose 这五个核心 API 是如何实现的？',
    ignore_scope: 'React-Redux 绑定、异步中间件（redux-thunk）、性能优化',
    output_language: '中文',
    desired_depth: 'deep',
    target_step_count: 12,
    preferred_style: 'Build Your Own Redux 风格，从零构建，先让最小功能跑起来，再逐步指出不足并引入新概念修正'
  }
};
fs.writeFileSync('/tmp/create_draft_payload.json', JSON.stringify(payload));
"

echo "Creating draft..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/drafts" \
  -H "Content-Type: application/json" \
  -d @/tmp/create_draft_payload.json)

echo "$CREATE_RESPONSE" | head -c 200
echo ""

DRAFT_ID=$(echo "$CREATE_RESPONSE" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); try{console.log(JSON.parse(d).id)}catch(e){console.error('Parse error:', d.slice(0,200));process.exit(1)}")

if [ -z "$DRAFT_ID" ]; then
  echo "ERROR: Failed to create draft"
  echo "$CREATE_RESPONSE"
  exit 1
fi

echo "Draft ID: $DRAFT_ID"
echo ""

echo "=== Step 2: Triggering v2 generation ==="
echo "Connecting to SSE stream..."

# Stream the generation and capture events
curl -s -N -X POST "$BASE_URL/api/drafts/$DRAFT_ID/generate" \
  -H "Content-Type: application/json" \
  -d '{"generationVersion":"v2"}' \
  2>&1 | tee /tmp/generation_sse_output.txt

echo ""
echo "=== Step 3: Checking result ==="

# Wait a moment for persistence
sleep 3

# Fetch the generated draft
DRAFT_RESPONSE=$(curl -s "$BASE_URL/api/drafts/$DRAFT_ID")
echo "$DRAFT_RESPONSE" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('Generation state:', d.generationState);
console.log('Validation valid:', d.validationValid);
console.log('Validation errors:', JSON.stringify(d.validationErrors, null, 2));
if (d.generationQuality) {
  console.log('\\nQuality metrics:');
  console.log(JSON.stringify(d.generationQuality, null, 2));
}
if (d.tutorialDraft) {
  console.log('\\nTutorial draft:');
  console.log('  Title:', d.tutorialDraft.meta?.title);
  console.log('  Steps:', d.tutorialDraft.steps?.length);
  d.tutorialDraft.steps?.forEach((s, i) => {
    const patchCount = s.patches?.length || 0;
    const locChange = s.patches?.reduce((sum, p) => {
      return sum + Math.abs(p.replace.split('\\n').length - p.find.split('\\n').length);
    }, 0) || 0;
    console.log(\`  Step \${i+1}: \${s.title} (patches: \${patchCount}, LOC change: ~\${locChange})\`);
  });
}
if (d.generationOutline) {
  console.log('\\nOutline steps:');
  d.generationOutline.steps?.forEach((s, i) => {
    console.log(\`  \${i+1}. \${s.title}\`);
    console.log(\`     Goal: \${s.teachingGoal}\`);
    console.log(\`     Concept: \${s.conceptIntroduced}\`);
    console.log(\`     Est LOC: \${s.estimatedLocChange}\`);
  });
}
" 2>&1

echo ""
echo "=== Full SSE output ==="
cat /tmp/generation_sse_output.txt

echo ""
echo "Draft ID for inspection: $DRAFT_ID"
