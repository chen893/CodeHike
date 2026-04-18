# 用户自定义 API Key & Provider 融入 VibeDocs — 调研报告

**调研日期**: 2026-04-14
**调研方式**: 3 个专项调研 agent 并行 + 综合分析

---

## 一、现状分析

| 维度 | 当前状态 |
|------|----------|
| **Provider 管理** | `provider-registry.ts` 硬编码 `deepseek` + `openai`，key 从 `process.env` 读取 |
| **实例缓存** | `providerCache` 全局单例，所有用户共享同一 provider 实例 |
| **模型选择** | `model-config.ts` 静态列表，前端选择后传 `modelId` 到后端 |
| **用户表** | `users` 表无 key 存储字段 |
| **生成链路** | route handler → `generate-tutorial-draft.ts` → `multi-phase-generator.ts` → `createProvider(modelId)` |

**核心问题**: 所有用户共享系统级 env key，无法按用户隔离 provider/key。

---

## 二、行业最佳实践调研

### 2.1 产品做法对比表

| 产品 | 存储位置 | 验证方式 | 多 Provider | 自定义 Base URL | Key 生命周期管理 |
|------|---------|---------|------------|----------------|----------------|
| **Cursor** | 客户端本地配置 | 使用时验证 | ✓ | ✗ | 手动编辑配置文件 |
| **Continue.dev** | 客户端本地配置 | 使用时验证 | ✓ | ✓ | 手动编辑配置文件 |
| **OpenRouter** | 服务端（聚合平台） | API 验证 | ✓（聚合） | ✓ | 用户仪表板管理 |
| **Vercel AI SDK** | 开发者决定 | 开发者实现 | ✓ | ✓ | 依赖开发者 |
| **LobeChat** | 客户端 indexedDB | 探测验证 | ✓ | ✓ | UI 完整 CRUD |
| **Open WebUI** | 服务端数据库 | 可选验证 | ✓ | ✓ | UI 完整 CRUD |
| **ChatGPT/Claude** | 服务端加密存储 | 实时验证 | ✗ | ✗ | 平台管理 |

### 2.2 关键发现

**1. 存储位置两极分化**

- **客户端存储**（Cursor、Continue、LobeChat 默认）— 零服务器风险，跨设备同步困难
- **服务端存储**（OpenRouter、Open WebUI、SaaS 平台）— 跨设备可用，需强加密
- **趋势**: 混合模式正在兴起（默认本地 + 可选同步）

**2. 验证策略**

- **立即探测**（LobeChat、Open WebUI）— 配置后立即测试，即时反馈
- **延迟验证**（Cursor、Continue）— 首次使用时才验证，减少配置阻力
- **最佳实践**: 提供"测试连接"按钮，但非强制

**3. 自定义 Base URL 成为标配**

- 6/7 产品支持（Cursor 除外）
- 格式标准: OpenAI 兼容格式 `https://host/v1`
- 用途: 代理服务、私有部署、地域优化、调试环境

**4. 多 Provider 支持模式**

- **聚合平台模式**（OpenRouter）: 一个 key 访问所有模型
- **直连模式**（Cursor、LobeChat）: 用户管理每个 provider 的 key
- **建议**: 支持两种模式 — 默认用户配置自己的 keys，可选支持 OpenRouter 等聚合服务

### 2.3 对 VibeDocs 的推荐

VibeDocs 是 SaaS 产品，**必须采用服务端加密存储**。推荐方案：

- AES-256-GCM 加密后存入 PostgreSQL
- 支持自定义 Base URL（OpenAI 兼容格式）
- 立即验证连通性
- 向后兼容系统默认 key

---

## 三、Vercel AI SDK 技术可行性

### 3.1 createOpenAICompatible API 签名

```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const provider = createOpenAICompatible({
  name: string,                    // Provider 名称
  baseURL: string,                 // API 基础 URL
  apiKey: string,                  // API Key（运行时传入）
  headers: Record<string, string> | (() => Record<string, string>),  // 支持函数
  queryParams: Record<string, string>,
  fetch: FetchFunction,            // 自定义 fetch
});
```

**核心发现**:
- `apiKey` 参数可在创建时传入，不强制依赖环境变量
- `headers` 支持**函数形式**，可在每次请求时动态计算
- Provider 实例本身是**无状态**的，多用户并发使用不同 key 完全安全
- 每次 `generateText/streamText` 都是独立的 HTTP 请求

### 3.2 并发安全性确认

- SDK 没有内置的会话复用机制
- 多用户使用不同 key 只需创建不同的 Provider 实例
- **完全并发安全，无需加锁**

### 3.3 当前代码改造清单

| 文件 | 改造内容 | 优先级 |
|------|---------|--------|
| `lib/ai/provider-registry.ts` | 移除全局缓存，支持 per-request apiKey | P0 |
| `lib/ai/multi-phase-generator.ts` | 添加 credentials 参数透传 | P0 |
| `lib/ai/tutorial-generator.ts` | 添加 credentials 参数透传 | P0 |
| `lib/services/generate-tutorial-draft.ts` | 添加 credentials 参数透传 | P0 |
| `app/api/drafts/[id]/generate/route.ts` | 从 DB 读用户 key 并透传 | P0 |
| `lib/ai/tag-generator.ts` | 添加 credentials 参数透传 | P1 |

### 3.4 推荐 Key 传递方案

```
Route Handler Layer (app/api/...)
    ↓ 获取 userApiKey（从 DB 解密）
Service Layer (lib/services/...)
    ↓ 透传 { apiKey, baseURL }
AI Layer (lib/ai/...)
    ↓ createProviderWithKey(modelId, credentials)
```

**向后兼容**:
```typescript
const apiKey = userApiKey || process.env[config.apiKeyEnvVar];
// 有用户 key → 使用用户 key
// 无用户 key → 回退到系统默认 key
```

---

## 四、数据库层设计方案

### 4.1 加密方案选择

**推荐: 应用层 AES-256-GCM + PBKDF2**

```
ENCRYPTION_MASTER_KEY (env, 32 bytes hex)
     ↓ PBKDF2 (100,000 迭代 + random salt)
  派生密钥
     ↓ AES-256-GCM 加密
  密文 + IV + AuthTag
     ↓ 存入 user_api_keys 表
```

选择理由:
- 与 Node.js/Next.js 技术栈天然兼容
- 不依赖数据库扩展，便于迁移
- 密钥与数据分离存储，安全性高
- GCM 模式提供认证加密，防篡改

### 4.2 数据库 Schema

```typescript
// lib/db/schema.ts — 新增

export const apiKeyProviderEnum = pgEnum('api_key_provider', [
  'deepseek', 'openai', 'anthropic', 'custom'
]);

export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  provider: apiKeyProviderEnum('provider').notNull(),
  label: varchar('label', { length: 128 }),
  baseUrl: varchar('base_url', { length: 512 }),

  // 加密数据包
  encryptedKey: text('encrypted_key').notNull(),
  keyIv: varchar('key_iv', { length: 64 }).notNull(),
  keyTag: varchar('key_tag', { length: 64 }).notNull(),
  keySalt: varchar('key_salt', { length: 64 }).notNull(),
  keyHint: varchar('key_hint', { length: 16 }).notNull(),  // 前4后4位

  isActive: boolean('is_active').default(true).notNull(),

  // 验证状态
  isValidated: boolean('is_validated').default(false).notNull(),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  validationError: text('validation_error'),

  // 使用统计
  usageCount: integer('usage_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 4.3 加密工具实现

```typescript
// lib/utils/key-crypto.ts

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedKeyData {
  encryptedKey: string;
  iv: string;
  salt: string;
  tag: string;
}

function getMasterKey(): Buffer {
  const keyString = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyString || keyString.length !== KEY_LENGTH * 2) {
    throw new Error('Invalid or missing ENCRYPTION_MASTER_KEY');
  }
  return Buffer.from(keyString, 'hex');
}

export function encryptApiKey(plainKey: string): EncryptedKeyData {
  const iv = randomBytes(IV_LENGTH);
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = pbkdf2Sync(getMasterKey(), salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptApiKey(data: EncryptedKeyData): string {
  const derivedKey = pbkdf2Sync(
    getMasterKey(),
    Buffer.from(data.salt, 'hex'),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  const decipher = createDecipheriv(ALGORITHM, derivedKey, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));

  let decrypted = decipher.update(data.encryptedKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getKeyHint(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
```

### 4.4 API 端点设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/user/keys` | GET | 列出用户所有 key（脱敏，只返回 keyHint） |
| `/api/user/keys` | POST | 添加新 key（加密存储） |
| `/api/user/keys/[id]` | PUT | 更新 key |
| `/api/user/keys/[id]` | DELETE | 删除 key |
| `/api/user/keys/[id]/verify` | POST | 验证 key 连通性（probe） |

---

## 五、安全考虑清单

| 项目 | 方案 | 优先级 |
|------|------|--------|
| **加密算法** | AES-256-GCM（认证加密，防篡改） | 必须 |
| **密钥派生** | PBKDF2 (100,000 迭代 + random salt) | 必须 |
| **密钥管理** | `ENCRYPTION_MASTER_KEY` 环境变量，32 bytes hex，不进 DB | 必须 |
| **传输安全** | HTTPS only，key 不入 URL/query string | 必须 |
| **存储脱敏** | DB 只存密文，API 响应只返回 `keyHint`（前4后4） | 必须 |
| **日志安全** | key 不入 console.log / 错误追踪 / analytics | 必须 |
| **级联清理** | 用户删除时 CASCADE 删除所有 key | 必须 |
| **访问隔离** | userId 校验，用户只能操作自己的 key | 必须 |
| **速率限制** | key CRUD 接口加 rate limit 防暴力 | 建议 |
| **Probe 安全** | 验证时用最小 prompt，不消耗用户 quota | 建议 |
| **密钥轮转** | 支持 keyVersion 字段，设计 re-encrypt 流程 | 建议 |
| **审计日志** | usageCount / lastUsedAt 追踪使用情况 | 建议 |

---

## 六、前端 UI 设计

### 6.1 配置页面

```
Settings > API Keys 页面
┌──────────────────────────────────────────────────┐
│  API Key 管理                                     │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Provider: [DeepSeek ▼]  （下拉选择）          │ │
│  │ API Key:  [••••••••••••••••]  [👁]          │ │
│  │ Base URL: [https://api.deepseek.com]          │ │
│  │           ☐ 使用自定义 endpoint               │ │
│  │                                                │ │
│  │  [验证连通性]  [保存]                          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  已配置的 Key:                                      │
│  ┌──────────────────────────────────────────────┐ │
│  │ ✅ DeepSeek  sk-8e...5583                     │ │
│  │    上次验证: 2分钟前  [编辑] [删除]             │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │ ❌ OpenAI   sk-pr...9x2z                      │ │
│  │    验证失败: 无效 key   [编辑] [删除]          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  💡 未配置的 provider 将使用系统默认 key            │
└──────────────────────────────────────────────────┘
```

### 6.2 预定义 Provider 列表

```typescript
const PREDEFINED_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com' },
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', baseURL: 'https://api.anthropic.com' },
  { id: 'custom', name: '自定义 (OpenAI 兼容)', baseURL: '' },
];
```

---

## 七、实施计划

### 7.1 阶段划分

| 阶段 | 内容 | 新增/改动文件 | 预估 |
|------|------|-------------|------|
| **P0: 基础设施** | 加密工具 + DB schema + migration | `lib/utils/key-crypto.ts`(新), `lib/db/schema.ts`(改) | 1天 |
| **P1: 数据层** | Repository + Service（CRUD + 解密） | `lib/repositories/user-api-key-repository.ts`(新), `lib/services/user-api-key-service.ts`(新) | 1天 |
| **P2: API 端点** | RESTful CRUD + verify | `app/api/user/keys/`(新) | 1天 |
| **P3: Provider 改造** | 移除缓存 + per-request key | `lib/ai/provider-registry.ts`(改), 4个 AI 层文件(改) | 0.5天 |
| **P4: 生成链路集成** | route handler → service → AI 透传 | `generate/route.ts`(改), `generate-tutorial-draft.ts`(改) | 0.5天 |
| **P5: 前端 UI** | Key 管理设置页 | `components/settings/`(新) | 2天 |
| **P6: 文档同步** | 更新 AGENTS.md + handbook | docs(改) | 0.5天 |

**总计约 6-7 天**

### 7.2 环境变量新增

```bash
# .env.local 新增
ENCRYPTION_MASTER_KEY=<64位十六进制字符串>
# 生成命令: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 八、风险和注意事项

1. **向后兼容优先** — 无 key 用户继续使用系统默认 key，零迁移成本
2. **providerCache 必须移除** — 否则第一个用户的 key 会被缓存，后续用户串 key
3. **ENCRYPTION_MASTER_KEY 轮转** — 需要设计 re-encrypt 流程，否则换 key 后旧数据不可解密
4. **多 provider 场景** — 用户可能同时配 DeepSeek + OpenAI，生成时需根据选择的 modelId 匹配对应 provider 的 key
5. **并发性能** — 每次生成都查 DB + 解密，可考虑短 TTL 内存缓存（如 60s，key 为 userId+provider）
6. **自定义 Base URL** — 允许用户填任意 OpenAI 兼容 endpoint（如 OpenRouter、自部署 vLLM），扩展性极大

---

## 九、参考资料

- [Cursor AI Models 文档](https://docs.cursor.com/features/ai-models)
- [OpenRouter 快速开始](https://openrouter.ai/docs/quick-start)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [LobeChat 设置文档](https://lobehub.com/docs/lobe-chat/settings)
- [Open WebUI 文档](https://docs.openwebui.com)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

**调研团队**: industry-researcher, sdk-researcher, db-researcher
**综合整理**: team-lead
**更新时间**: 2026-04-14
