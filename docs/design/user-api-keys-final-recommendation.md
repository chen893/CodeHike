# 用户 API 密钥管理系统 - 最终推荐方案

## 一、执行摘要

基于三项调研成果（业界最佳实践、Vercel AI SDK 模式、数据库层设计），为 CodeHike 平台设计一套完整的用户 API 密钥管理系统。方案采用**应用层 AES-256-GCM 加密 + Drizzle ORM + RESTful API** 架构，预计实施周期 6-10 天。

**核心决策**:
- 加密方案：应用层 AES-256-GCM（而非 pgcrypto）
- 存储设计：新增 `user_api_keys` 表，支持级联删除
- API 设计：5 端点 RESTful 接口，完全脱敏响应
- 集成策略：Provider Registry 双层查找（用户密钥优先，平台密钥兜底）

---

## 二、架构设计总览

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Next.js)                          │
├─────────────────────────────────────────────────────────────────┤
│  API Key 设置页面                                                │
│  - 密钥列表展示（脱敏）                                           │
│  - 创建/编辑/删除密钥                                             │
│  - 验证状态指示                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 层 (Next.js App Router)                 │
├─────────────────────────────────────────────────────────────────┤
│  GET    /api/user/api-keys         # 列表                       │
│  POST   /api/user/api-keys         # 创建                       │
│  GET    /api/user/api-keys/:id     # 详情                       │
│  PATCH  /api/user/api-keys/:id     # 更新                       │
│  DELETE /api/user/api-keys/:id     # 删除                       │
│  POST   /api/user/api-keys/:id/validate  # 验证                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        服务层 (Services)                         │
├─────────────────────────────────────────────────────────────────┤
│  ApiKeyEncryption           # 加密/解密服务                      │
│  ApiKeyService              # 业务逻辑                           │
│  ProviderRegistry (修改)    # 动态 Provider 查找                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据访问层 (Repository)                      │
├─────────────────────────────────────────────────────────────────┤
│  userApiKeys Repository       # Drizzle ORM 查询封装             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    数据库层 (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────┤
│  users                        # 现有表                           │
│  └─ user_api_keys (NEW)      # 新增表，级联删除                  │
│      - encrypted_key                                            │
│      - provider                                                 │
│      - scope                                                    │
│      - is_validated                                             │
│      - usage_count                                              │
└─────────────────────────────────────────────────────────────────┘

                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    外部服务 (AI Providers)                       │
├─────────────────────────────────────────────────────────────────┤
│  DeepSeek API              │  OpenAI API                        │
│  Anthropic API             │  其他...                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**创建 API 密钥流程**:
```
用户输入 → 前端验证 → POST /api/user/api-keys
  → NextAuth 认证 → AES-256-GCM 加密
  → 写入 user_api_keys 表 → 返回脱敏响应
```

**使用 API 密钥流程**:
```
教程生成请求 → ProviderRegistry.lookup(userId, 'deepseek')
  → 查询 user_api_keys → AES-256-GCM 解密
  → 返回明文密钥 → 调用 DeepSeek API
  → 更新 usage_count/last_used_at
```

---

## 三、数据库 Schema 设计

### 3.1 完整表定义

```typescript
// lib/db/schema.ts 中添加

export const apiKeyProviderEnum = pgEnum('api_key_provider', [
  'deepseek',
  'openai',
  'anthropic',
  'cohere',
  'mistral',
  'custom',
])

export const apiKeyScopeEnum = pgEnum('api_key_scope', [
  'chat',
  'code_generation',
  'tutorial_create',
  'full_access',
])

export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  provider: apiKeyProviderEnum('provider').notNull(),
  
  // 加密数据包（JSONB 存储完整加密元数据）
  encryptionData: jsonb('encryption_data').$type<{
    encryptedKey: string;
    iv: string;
    salt: string;
    keyVersion: number;
  }>().notNull(),
  
  scope: apiKeyScopeEnum('scope').notNull().default('full_access'),
  customConfig: jsonb('custom_config').$type<Record<string, unknown> | null>(),
  displayName: varchar('display_name', { length: 256 }),
  
  isEnabled: boolean('is_enabled').notNull().default(true),
  
  // 验证状态
  isValidated: boolean('is_validated').notNull().default(false),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  validationErrorMessage: text('validation_error_message'),
  
  // 使用统计
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 3.2 迁移 SQL

```sql
-- drizzle-kit push 生成

CREATE TYPE "api_key_provider" AS ENUM (
  'deepseek', 'openai', 'anthropic', 'cohere', 'mistral', 'custom'
);

CREATE TYPE "api_key_scope" AS ENUM (
  'chat', 'code_generation', 'tutorial_create', 'full_access'
);

CREATE TABLE "user_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" "api_key_provider" NOT NULL,
  "encryption_data" jsonb NOT NULL,
  "scope" "api_key_scope" NOT NULL DEFAULT 'full_access',
  "custom_config" jsonb,
  "display_name" varchar(256),
  "is_enabled" boolean NOT NULL DEFAULT true,
  "is_validated" boolean NOT NULL DEFAULT false,
  "last_validated_at" timestamp with time zone,
  "validation_error_message" text,
  "usage_count" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_user_api_keys_user_id" ON "user_api_keys"("userId");
CREATE INDEX "idx_user_api_keys_user_provider" ON "user_api_keys"("userId", "provider");
```

---

## 四、加密服务实现

### 4.1 加密工具类

```typescript
// lib/encryption/api-key-encryption.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedData {
  encryptedKey: string;
  iv: string;
  salt: string;
  keyVersion: number;
}

export class ApiKeyEncryption {
  private masterKey: Buffer;

  constructor() {
    const keyString = process.env.ENCRYPTION_MASTER_KEY;
    if (!keyString || keyString.length !== KEY_LENGTH * 2) {
      throw new Error('Invalid ENCRYPTION_MASTER_KEY');
    }
    this.masterKey = Buffer.from(keyString, 'hex');
  }

  encrypt(apiKey: string, keyVersion: number = 1): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    const derivedKey = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );

    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encryptedKey: `${encrypted}:${authTag.toString('hex')}`,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      keyVersion,
    };
  }

  decrypt(data: EncryptedData): string {
    const [ciphertext, authTagHex] = data.encryptedKey.split(':');

    const derivedKey = crypto.pbkdf2Sync(
      this.masterKey,
      Buffer.from(data.salt, 'hex'),
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      derivedKey,
      Buffer.from(data.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

let instance: ApiKeyEncryption | null = null;
export function getEncryption(): ApiKeyEncryption {
  if (!instance) instance = new ApiKeyEncryption();
  return instance;
}
```

---

## 五、API 端点实现

### 5.1 主路由文件

```typescript
// app/api/user/api-keys/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { userApiKeys } from '@/lib/db/schema';
import { getEncryption } from '@/lib/encryption/api-key-encryption';
import { eq, and, desc } from 'drizzle-orm';

// GET /api/user/api-keys - 获取列表
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  const keys = await db.query.userApiKeys.findMany({
    where: eq(userApiKeys.userId, session.user.id),
    orderBy: [desc(userApiKeys.createdAt)],
  });

  return NextResponse.json({
    keys: keys.map(k => ({
      id: k.id,
      provider: k.provider,
      displayName: k.displayName,
      scope: k.scope,
      isEnabled: k.isEnabled,
      isValidated: k.isValidated,
      usageCount: k.usageCount,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      maskedKey: `${k.provider.substring(0, 2)}...${k.id.substring(0, 4)}`,
    }))
  });
}

// POST /api/user/api-keys - 创建密钥
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  const body = await req.json();
  const { provider, apiKey, displayName, scope } = body;

  if (!provider || !apiKey) {
    return NextResponse.json(
      { message: 'provider 和 apiKey 为必填项' },
      { status: 400 }
    );
  }

  const encryption = getEncryption();
  const encrypted = encryption.encrypt(apiKey, 1);

  const [newKey] = await db.insert(userApiKeys).values({
    userId: session.user.id,
    provider,
    encryptionData: encrypted,
    scope: scope || 'full_access',
    displayName: displayName || null,
    isEnabled: true,
    isValidated: false,
    usageCount: 0,
  }).returning();

  return NextResponse.json({
    id: newKey.id,
    provider: newKey.provider,
  }, { status: 201 });
}
```

### 5.2 详情路由文件

```typescript
// app/api/user/api-keys/[id]/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { userApiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// DELETE /api/user/api-keys/:id
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  await db.delete(userApiKeys).where(
    and(
      eq(userApiKeys.id, params.id),
      eq(userApiKeys.userId, session.user.id)
    )
  );

  return NextResponse.json({ success: true });
}
```

---

## 六、Provider Registry 集成

### 6.1 修改后的查找逻辑

```typescript
// lib/ai/provider-registry.ts (新增 getUserApiKey)

import { db } from '@/lib/db';
import { userApiKeys } from '@/lib/db/schema';
import { getEncryption } from '@/lib/encryption/api-key-encryption';
import { eq, and } from 'drizzle-orm';

export async function getUserApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const record = await db.query.userApiKeys.findFirst({
    where: and(
      eq(userApiKeys.userId, userId),
      eq(userApiKeys.provider, provider),
      eq(userApiKeys.isEnabled, true)
    ),
  });

  if (!record) return null;

  // 解密
  const encryption = getEncryption();
  const decryptedKey = encryption.decrypt(record.encryptionData);

  // 更新统计
  await db.update(userApiKeys).set({
    usageCount: record.usageCount + 1,
    lastUsedAt: new Date(),
  }).where(eq(userApiKeys.id, record.id));

  return decryptedKey;
}

// 修改后的 getProviderConfig
export async function getProviderConfig(userId: string, providerName: string) {
  const config = PROVIDERS[providerName];
  if (!config) throw new Error(`Unknown provider: ${providerName}`);

  // 优先使用用户密钥，回退到平台默认
  const userApiKey = await getUserApiKey(userId, providerName);
  
  return {
    ...config,
    apiKey: userApiKey || process.env[config.apiKeyEnvVar],
  };
}
```

---

## 七、前后端改动清单

### 7.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `lib/db/schema.ts` | 添加 `userApiKeys` 表定义 |
| `lib/encryption/api-key-encryption.ts` | 加密服务 |
| `lib/repositories/api-key-repository.ts` | 数据访问层（可选） |
| `app/api/user/api-keys/route.ts` | 列表和创建 API |
| `app/api/user/api-keys/[id]/route.ts` | 详情、更新、删除 API |
| `app/api/user/api-keys/[id]/validate/route.ts` | 验证 API |
| `app/settings/api-keys/page.tsx` | 前端密钥管理页面 |

### 7.2 修改文件

| 文件路径 | 改动内容 |
|----------|----------|
| `lib/ai/provider-registry.ts` | 添加 `getUserApiKey()`，修改 `getProviderConfig()` |
| `.env.local` | 添加 `ENCRYPTION_MASTER_KEY` |
| `drizzle.config.ts` | 无需改动，自动检测新表 |

### 7.3 数据库迁移

```bash
# 1. 生成迁移
npx drizzle-kit generate

# 2. 应用迁移
npx drizzle-kit push

# 3. 验证表结构
psql -c "\d user_api_keys"
```

---

## 八、安全考虑

### 8.1 安全措施清单

| 措施 | 实现方式 | 优先级 |
|------|----------|--------|
| **静态加密** | AES-256-GCM + PBKDF2 | 🔴 必须实施 |
| **传输加密** | 强制 HTTPS | 🔴 必须实施 |
| **访问隔离** | userId 隔离 + NextAuth 认证 | 🔴 必须实施 |
| **响应脱敏** | API 不返回明文密钥 | 🔴 必须实施 |
| **级联删除** | 用户删除时自动清理 | 🔴 必须实施 |
| **审计日志** | usageCount/lastUsedAt | 🟡 建议实施 |
| **密钥验证** | 创建后调用 Provider API 验证 | 🟢 可选实施 |
| **密钥轮换** | keyVersion 支持未来轮换 | 🟡 建议实施 |
| **速率限制** | 验证接口限流 | 🟢 可选实施 |

### 8.2 敏感数据处理

1. **日志脱敏**: 确保密钥不进入 console.log 或服务器日志
2. **请求清理**: 处理后立即从 request.body 删除 apiKey
3. **错误模糊化**: 不返回"密钥格式错误"等可被利用的信息

### 8.3 主密钥管理

```bash
# 生成主密钥（仅需一次）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 添加到环境变量
ENCRYPTION_MASTER_KEY=<生成的64位十六进制字符串>

# 生产环境建议：使用 AWS KMS 或类似服务
```

---

## 九、实施步骤

### 阶段 1：数据层（Day 1-2）
- [ ] 添加 `userApiKeys` 表定义
- [ ] 实现加密服务
- [ ] 生成并应用数据库迁移
- [ ] 编写加密单元测试

### 阶段 2：API 层（Day 3-4）
- [ ] 实现列表和创建 API
- [ ] 实现详情、更新、删除 API
- [ ] 实现验证 API（可选）
- [ ] API 集成测试

### 阶段 3：集成（Day 5-6）
- [ ] 修改 Provider Registry
- [ ] 实现降级策略（用户密钥失效时回退）
- [ ] 后端集成测试

### 阶段 4：前端 UI（Day 7-8）
- [ ] 创建密钥管理页面
- [ ] 实现创建/删除表单
- [ ] 显示验证状态和使用统计
- [ ] E2E 测试

### 阶段 5：优化与上线（Day 9-10）
- [ ] 性能优化（索引、缓存）
- [ ] 安全审计
- [ ] 监控告警配置
- [ ] 文档更新

---

## 十、风险与注意事项

### 10.1 风险矩阵

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **主密钥泄露** | 严重 | 低 | 使用环境变量 + 访问控制 + 定期轮换 |
| **加密算法破解** | 严重 | 极低 | 使用标准 AES-256-GCM，定期审查 |
| **用户密钥失效** | 中等 | 高 | 降级到平台默认密钥 + 用户通知 |
| **数据库被入侵** | 严重 | 低 | 加密存储 + 密钥分离 + 访问审计 |
| **性能影响** | 低 | 中 | 异步更新统计 + 索引优化 |

### 10.2 注意事项

1. **密钥永不在日志中出现**：使用 winston 或 pino 的敏感字段过滤
2. **降级策略**：用户密钥失败时记录日志并回退到平台密钥
3. **GDPR 合规**：用户删除时通过 `onDelete: 'cascade'` 自动清理
4. **监控告警**：监控解密失败率、密钥验证失败率

### 10.3 未来扩展

1. **多主密钥支持**：为不同时间段创建的数据使用不同密钥
2. **密钥导入**：支持从其他平台（如 LobeChat）导入密钥
3. **共享密钥**：团队/组织内共享 API 密钥
4. **预算控制**：集成 Provider API 使用量查询

---

## 十一、环境变量配置

```bash
# .env.local 新增
ENCRYPTION_MASTER_KEY=<64位十六进制字符串>

# 现有变量（作为降级默认值）
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

---

## 十二、验收标准

1. **功能验收**：
   - 用户可以创建、查看、删除 API 密钥
   - 教程生成时优先使用用户密钥
   - 用户密钥失效时自动降级到平台密钥

2. **安全验收**：
   - 数据库中密钥为加密存储
   - API 响应不包含明文密钥
   - 用户删除时密钥被级联删除

3. **性能验收**：
   - 密钥查询耗时 < 50ms (P95)
   - 加密/解密耗时 < 10ms

---

## 十三、参考资源

1. **详细设计文档**: `docs/design/user-api-keys-storage-design.md`
2. **Drizzle ORM**: https://orm.drizzle.team/
3. **NextAuth.js**: https://authjs.dev/
4. **OWASP Key Management**: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
