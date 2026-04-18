# 用户 API 密钥存储管理系统设计方案

## 一、项目背景

### 1.1 需求概述
为 CodeHike 平台设计一套安全的用户 API 密钥存储和管理系统，允许用户配置自己的 AI 服务提供商密钥（如 DeepSeek、OpenAI 等），而非仅依赖平台统一配置。

### 1.2 当前架构分析
- **认证系统**: NextAuth v5 with DrizzleAdapter，使用 JWT session 策略
- **OAuth 提供商**: GitHub、Linux.do
- **数据库**: PostgreSQL + Drizzle ORM
- **现有用户表**: 包含 `id`, `name`, `email`, `image`, `username`, `bio`
- **当前 Provider 配置**: 使用环境变量 `process.env` 读取 API 密钥

### 1.3 设计目标
1. 安全存储用户敏感凭证（API 密钥）
2. 支持多种 AI 提供商（DeepSeek、OpenAI、Claude 等）
3. 符合现有代码风格和架构模式
4. 提供完整的 CRUD API 接口
5. 支持 API 密钥验证和作用域管理

---

## 二、加密方案对比与推荐

### 2.1 方案对比表

| 方案 | 安全性 | 性能 | 实现复杂度 | 密钥管理 | 推荐场景 |
|------|--------|------|------------|----------|----------|
| **应用层 AES-256-GCM** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中等 | 需要管理主密钥 | **推荐用于本项目** |
| **pgcrypto** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 低 | 数据库内管理 | 需要数据库扩展 |
| **混合方案 (Envelope)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 高 | 需要密钥管理服务 | 大规模多租户 |
| **Vault/HSM** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 很高 | 外部服务 | 企业级合规 |

### 2.2 推荐方案：应用层 AES-256-GCM 加密

**选择理由**:
1. 与 Node.js/Next.js 技术栈天然兼容
2. 不依赖数据库扩展，便于迁移
3. 可利用 Web Crypto API 或 crypto 模块
4. 密钥与数据分离存储，提高安全性
5. 实现复杂度适中，维护成本低

**加密参数**:
```typescript
// 加密算法配置
- 算法: AES-256-GCM
- 密钥长度: 256 bits (32 bytes)
- IV 长度: 12 bytes (GCM 推荐)
- Auth Tag: 16 bytes (自动附加)
- 密钥派生: PBKDF2 (100,000+ 迭代) 或直接使用随机生成的密钥
```

### 2.3 密钥管理策略

**主密钥 (Master Key) 存储**:
- 使用环境变量 `ENCRYPTION_MASTER_KEY` (推荐)
- 或使用 AWS KMS、HashiCorp Vault 等密钥管理服务
- 密钥轮换计划：每 6-12 个月轮换一次

**密钥轮换策略**:
1. 生成新的主密钥
2. 新数据使用新密钥加密
3. 旧数据在读取时用旧密钥解密并用新密钥重新加密（懒加载重加密）
4. 保留旧密钥直到所有数据迁移完成

---

## 三、数据库 Schema 设计

### 3.1 完整 Drizzle Schema 定义

```typescript
// lib/db/schema.ts 中添加

import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'

// API 提供商枚举（可扩展）
export const apiKeyProviderEnum = pgEnum('api_key_provider', [
  'deepseek',
  'openai',
  'anthropic',
  'cohere',
  'mistral',
  'custom',
])

// API 密钥作用域枚举
export const apiKeyScopeEnum = pgEnum('api_key_scope', [
  'chat',           // 聊天对话
  'code_generation', // 代码生成
  'tutorial_create', // 教程生成
  'full_access',     // 完全访问
])

export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // 用户关联（级联删除）
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  // 提供商信息
  provider: apiKeyProviderEnum('provider').notNull(),
  
  // 加密后的 API 密钥
  encryptedKey: text('encrypted_key').notNull(),
  
  // 加密元数据（用于密钥轮换）
  keyVersion: integer('key_version').notNull().default(1),
  
  // 作用域限制
  scope: apiKeyScopeEnum('scope').notNull().default('full_access'),
  
  // 自定义提供商配置（JSONB，用于 custom 提供商）
  customConfig: jsonb('custom_config').$type<Record<string, unknown> | null>(),
  
  // 显示名称（用户识别多个密钥）
  displayName: varchar('display_name', { length: 256 }),
  
  // 是否启用
  isEnabled: boolean('is_enabled').notNull().default(true),
  
  // 验证状态
  isValidated: boolean('is_validated').notNull().default(false),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  validationErrorMessage: text('validation_error_message'),
  
  // 使用统计
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  
  // 过期信息
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})
```

### 3.2 索引优化

```typescript
// 推荐添加的索引
create index('idx_user_api_keys_user_id') on userApiKeys('userId');
create index('idx_user_api_keys_provider') on userApiKeys('provider');
create index('idx_user_api_keys_user_provider') on userApiKeys('userId', 'provider');
```

### 3.3 迁移脚本示例

```sql
-- Drizzle Kit 生成的迁移 SQL
CREATE TYPE "api_key_provider" AS ENUM (
  'deepseek',
  'openai',
  'anthropic',
  'cohere',
  'mistral',
  'custom'
);

CREATE TYPE "api_key_scope" AS ENUM (
  'chat',
  'code_generation',
  'tutorial_create',
  'full_access'
);

CREATE TABLE "user_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" "api_key_provider" NOT NULL,
  "encrypted_key" text NOT NULL,
  "key_version" integer NOT NULL DEFAULT 1,
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
CREATE INDEX "idx_user_api_keys_provider" ON "user_api_keys"("provider");
CREATE INDEX "idx_user_api_keys_user_provider" ON "user_api_keys"("userId", "provider");
```

---

## 四、加密服务实现

### 4.1 加密工具类

```typescript
// lib/encryption/api-key-encryption.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32;

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
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be set and be 64 hex characters (32 bytes)'
      );
    }
    this.masterKey = Buffer.from(keyString, 'hex');
  }

  /**
   * 加密 API 密钥
   */
  encrypt(apiKey: string, keyVersion: number = 1): EncryptedData {
    // 生成随机 IV 和 Salt
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // 使用 PBKDF2 从主密钥派生加密密钥
    const derivedKey = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000, // 迭代次数
      KEY_LENGTH,
      'sha256'
    );

    // 加密
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 获取认证标签
    const authTag = cipher.getAuthTag();

    return {
      encryptedKey: encrypted + ':' + authTag.toString('hex'),
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      keyVersion,
    };
  }

  /**
   * 解密 API 密钥
   */
  decrypt(encryptedData: EncryptedData): string {
    const { encryptedKey, iv, salt } = encryptedData;

    // 分离密文和认证标签
    const [ciphertext, authTagHex] = encryptedKey.split(':');
    
    // 派生解密密钥
    const derivedKey = crypto.pbkdf2Sync(
      this.masterKey,
      Buffer.from(salt, 'hex'),
      100000,
      KEY_LENGTH,
      'sha256'
    );

    // 解密
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      derivedKey,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// 单例实例
let encryptionInstance: ApiKeyEncryption | null = null;

export function getEncryption(): ApiKeyEncryption {
  if (!encryptionInstance) {
    encryptionInstance = new ApiKeyEncryption();
  }
  return encryptionInstance;
}
```

### 4.2 主密钥生成

```bash
# 生成 32 字节随机密钥（64 个十六进制字符）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4.3 环境变量配置

```bash
# .env.local
ENCRYPTION_MASTER_KEY=<生成的64位十六进制字符串>
```

---

## 五、API 接口设计

### 5.1 路由结构

```
/api/user/api-keys
├── GET    /api/user/api-keys          # 获取用户的所有 API 密钥列表
├── POST   /api/user/api-keys          # 创建新的 API 密钥
├── GET    /api/user/api-keys/:id      # 获取特定 API 密钥详情
├── PATCH  /api/user/api-keys/:id      # 更新 API 密钥（不包含密钥值）
├── DELETE /api/user/api-keys/:id      # 删除 API 密钥
└── POST   /api/user/api-keys/:id/validate  # 验证 API 密钥有效性
```

### 5.2 API 响应格式（脱敏）

```typescript
// 列表和详情响应中不返回实际密钥值
type ApiKeyResponse = {
  id: string;
  provider: 'deepseek' | 'openai' | 'anthropic' | 'cohere' | 'mistral' | 'custom';
  displayName: string | null;
  scope: 'chat' | 'code_generation' | 'tutorial_create' | 'full_access';
  isEnabled: boolean;
  isValidated: boolean;
  lastValidatedAt: string | null;
  validationErrorMessage: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  
  // 脱敏显示（只显示前4位和后4位）
  maskedKey: string; // 例: "sk-...xyz8"
}

type CreateApiKeyRequest = {
  provider: string;
  apiKey: string;  // 纯文本密钥（仅创建时）
  displayName?: string;
  scope?: string;
  customConfig?: Record<string, unknown>;
}
```

### 5.3 完整 API 实现示例

```typescript
// app/api/user/api-keys/route.ts

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { userApiKeys } from '@/lib/db/schema';
import { getEncryption } from '@/lib/encryption/api-key-encryption';
import { eq, and, desc } from 'drizzle-orm';

/**
 * GET /api/user/api-keys
 * 获取当前用户的所有 API 密钥
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const keys = await db.query.userApiKeys.findMany({
      where: eq(userApiKeys.userId, session.user.id),
      orderBy: [desc(userApiKeys.createdAt)],
    });

    // 脱敏处理
    const maskedKeys = keys.map((key) => ({
      id: key.id,
      provider: key.provider,
      displayName: key.displayName,
      scope: key.scope,
      isEnabled: key.isEnabled,
      isValidated: key.isValidated,
      lastValidatedAt: key.lastValidatedAt?.toISOString() ?? null,
      validationErrorMessage: key.validationErrorMessage,
      usageCount: key.usageCount,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
      maskedKey: maskApiKey(key.encryptedKey),
    }));

    return NextResponse.json({ keys: maskedKeys });
  } catch (err: any) {
    console.error('获取 API 密钥列表失败:', err);
    return NextResponse.json(
      { message: '获取 API 密钥列表失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/api-keys
 * 创建新的 API 密钥
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { provider, apiKey, displayName, scope, customConfig } = body;

    // 验证必填字段
    if (!provider || !apiKey) {
      return NextResponse.json(
        { message: 'provider 和 apiKey 为必填项', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // 加密 API 密钥
    const encryption = getEncryption();
    const encrypted = encryption.encrypt(apiKey, 1);

    // 检查同一 provider 是否已有密钥
    const existing = await db.query.userApiKeys.findFirst({
      where: and(
        eq(userApiKeys.userId, session.user.id),
        eq(userApiKeys.provider, provider)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { message: `已存在 ${provider} 的 API 密钥`, code: 'DUPLICATE_KEY' },
        { status: 409 }
      );
    }

    // 创建记录
    const [newKey] = await db
      .insert(userApiKeys)
      .values({
        userId: session.user.id,
        provider,
        encryptedKey: encrypted.encryptedKey,
        keyVersion: encrypted.keyVersion,
        scope: scope || 'full_access',
        displayName: displayName || null,
        customConfig: customConfig || null,
        isEnabled: true,
        isValidated: false,
        usageCount: 0,
      })
      .returning();

    return NextResponse.json(
      {
        id: newKey.id,
        provider: newKey.provider,
        displayName: newKey.displayName,
        maskedKey: maskApiKey(newKey.encryptedKey),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('创建 API 密钥失败:', err);
    return NextResponse.json(
      { message: '创建 API 密钥失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * 脱敏显示 API 密钥
 */
function maskApiKey(encryptedKey: string): string {
  // 解密后只显示前 4 和后 4 位
  // 注意：这里应该先解密，但实际场景中只在创建时显示完整密钥一次
  return 'sk-****...****';
}

// app/api/user/api-keys/[id]/route.ts

/**
 * GET /api/user/api-keys/:id
 * 获取特定 API 密钥详情
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const apiKey = await db.query.userApiKeys.findFirst({
      where: and(
        eq(userApiKeys.id, params.id),
        eq(userApiKeys.userId, session.user.id)
      ),
    });

    if (!apiKey) {
      return NextResponse.json(
        { message: 'API 密钥不存在', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: apiKey.id,
      provider: apiKey.provider,
      displayName: apiKey.displayName,
      scope: apiKey.scope,
      isEnabled: apiKey.isEnabled,
      isValidated: apiKey.isValidated,
      lastValidatedAt: apiKey.lastValidatedAt?.toISOString() ?? null,
      usageCount: apiKey.usageCount,
      createdAt: apiKey.createdAt.toISOString(),
      maskedKey: maskApiKey(apiKey.encryptedKey),
    });
  } catch (err: any) {
    console.error('获取 API 密钥详情失败:', err);
    return NextResponse.json(
      { message: '获取 API 密钥详情失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/api-keys/:id
 * 删除 API 密钥
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    await db
      .delete(userApiKeys)
      .where(
        and(
          eq(userApiKeys.id, params.id),
          eq(userApiKeys.userId, session.user.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('删除 API 密钥失败:', err);
    return NextResponse.json(
      { message: '删除 API 密钥失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
```

---

## 六、与现有系统集成

### 6.1 Provider Registry 修改

```typescript
// lib/ai/provider-registry.ts (修改)

import { db } from '@/lib/db';
import { userApiKeys } from '@/lib/db/schema';
import { getEncryption } from '@/lib/encryption/api-key-encryption';
import { eq } from 'drizzle-orm';

export async function getUserApiKey(userId: string, provider: string): Promise<string | null> {
  const apiKeyRecord = await db.query.userApiKeys.findFirst({
    where: and(
      eq(userApiKeys.userId, userId),
      eq(userApiKeys.provider, provider),
      eq(userApiKeys.isEnabled, true)
    ),
  });

  if (!apiKeyRecord) {
    return null;
  }

  // 解密密钥
  const encryption = getEncryption();
  const decryptedKey = encryption.decrypt({
    encryptedKey: apiKeyRecord.encryptedKey,
    iv: '', // 需要存储 iv 和 salt
    salt: '',
    keyVersion: apiKeyRecord.keyVersion,
  });

  // 更新使用统计
  await db
    .update(userApiKeys)
    .set({
      usageCount: apiKeyRecord.usageCount + 1,
      lastUsedAt: new Date(),
    })
    .where(eq(userApiKeys.id, apiKeyRecord.id));

  return decryptedKey;
}

// 修改后的 Provider 配置读取
export async function getProviderConfig(userId: string, providerName: string) {
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  // 优先使用用户自己的密钥
  const userApiKey = await getUserApiKey(userId, providerName);
  
  return {
    ...config,
    apiKey: userApiKey || process.env[config.apiKeyEnvVar],
  };
}
```

### 6.2 Schema 存储优化

为了正确解密，需要将 IV 和 Salt 与密文一起存储：

```typescript
// 方案 A: 使用 JSONB 存储（推荐）
export const userApiKeys = pgTable('user_api_keys', {
  // ... 其他字段
  
  // 加密数据包（包含密文、IV、Salt、版本）
  encryptionData: jsonb('encryption_data').$type<{
    encryptedKey: string;
    iv: string;
    salt: string;
    keyVersion: number;
  }>().notNull(),
})

// 方案 B: 分开存储（如果不想用 JSONB）
export const userApiKeys = pgTable('user_api_keys', {
  // ... 其他字段
  encryptedKey: text('encrypted_key').notNull(),
  encryptionIv: text('encryption_iv').notNull(),
  encryptionSalt: text('encryption_salt').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
})
```

---

## 七、安全考虑与最佳实践

### 7.1 安全清单

| 安全项 | 实现方式 | 优先级 |
|--------|----------|--------|
| **传输加密** | 强制 HTTPS，API 路由使用 Next.js 安全中间件 | 🔴 高 |
| **静态加密** | AES-256-GCM 加密存储 | 🔴 高 |
| **密钥轮换** | keyVersion 字段支持，懒加载重加密 | 🟡 中 |
| **访问控制** | 基于 userId 的隔离，NextAuth 认证 | 🔴 高 |
| **审计日志** | usageCount、lastUsedAt 跟踪 | 🟡 中 |
| **密钥验证** | 创建后验证 API 密钥有效性 | 🟢 低 |
| **数据脱敏** | API 响应中不返回实际密钥值 | 🔴 高 |
| **级联删除** | 用户删除时自动清理 API 密钥 | 🔴 高 |
| **速率限制** | API 验证接口限流 | 🟡 中 |
| **作用域限制** | scope 字段限制密钥用途 | 🟢 低 |

### 7.2 数据保护

1. **密钥永不在日志中出现**：确保 API 密钥不打印到 console.log
2. **请求体脱敏**：在请求处理前提取 apiKey 后立即从 body 中删除
3. **错误消息模糊化**：不返回"密钥无效"等可能被利用的信息

### 7.3 合规性考虑

- **GDPR**：用户删除账号时，API 密钥应通过 `onDelete: 'cascade'` 自动删除
- **SOC2**：加密密钥访问审计（通过 lastUsedAt 等字段）
- **PCI DSS**：虽然不处理支付，但类似的密钥管理标准可参考

---

## 八、实施计划

### 阶段一：数据层（1-2天）
1. 创建 `user_api_keys` 表
2. 实现加密服务 `lib/encryption/api-key-encryption.ts`
3. 生成数据库迁移

### 阶段二：API 层（2-3天）
1. 实现 CRUD API 路由
2. 添加 API 密钥验证接口
3. 编写单元测试

### 阶段三：集成（2-3天）
1. 修改 `provider-registry.ts` 支持用户密钥
2. 更新前端 UI 添加密钥管理页面
3. 降级策略：用户密钥失效时回退到平台密钥

### 阶段四：优化（1-2天）
1. 添加使用统计和监控
2. 实现密钥轮换机制
3. 安全审计和渗透测试

---

## 九、参考资源

1. **Drizzle ORM 文档**: https://orm.drizzle.team/
2. **AES-GCM 标准**: NIST Special Publication 800-38D
3. **OWASP 密钥管理**: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
4. **NextAuth.js 文档**: https://authjs.dev/

---

## 十、附录

### A. 环境变量清单

```bash
# 加密主密钥（必填）
ENCRYPTION_MASTER_KEY=<64位十六进制字符串>

# 降级默认密钥（可选）
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

### B. 数据库查询示例

```sql
-- 查询用户的有效密钥数量
SELECT provider, COUNT(*) 
FROM user_api_keys 
WHERE userId = 'xxx' AND isEnabled = true 
GROUP BY provider;

-- 查找即将过期的密钥
SELECT * FROM user_api_keys 
WHERE expiresAt < NOW() + INTERVAL '7 days';

-- 清理未验证的旧密钥
DELETE FROM user_api_keys 
WHERE isValidated = false 
  AND createdAt < NOW() - INTERVAL '30 days';
```

### C. TypeScript 类型定义

```typescript
// types/api-key.ts
export type ApiKeyProvider = 'deepseek' | 'openai' | 'anthropic' | 'cohere' | 'mistral' | 'custom';
export type ApiKeyScope = 'chat' | 'code_generation' | 'tutorial_create' | 'full_access';

export interface CreateApiKeyDto {
  provider: ApiKeyProvider;
  apiKey: string;
  displayName?: string;
  scope?: ApiKeyScope;
  customConfig?: Record<string, unknown>;
}

export interface ApiKeyResponseDto {
  id: string;
  provider: ApiKeyProvider;
  displayName: string | null;
  scope: ApiKeyScope;
  isEnabled: boolean;
  isValidated: boolean;
  maskedKey: string;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}
```
