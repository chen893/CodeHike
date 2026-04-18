# AI 应用 API Key 管理最佳实践调研报告

**调研日期**: 2026-04-14
**调研目标**: 为 VibeDocs 项目（AI 教程生成 SaaS）提供 API Key 管理方案参考

---

## 一、产品做法对比表

| 产品 | 存储位置 | 验证方式 | 多 Provider | 自定义 Base URL | Key 生命周期管理 |
|------|---------|---------|------------|----------------|----------------|
| **Cursor** | 客户端本地配置 | 使用时验证 | ✓ | ✗ | 手动编辑配置文件 |
| **Continue.dev** | 客户端本地配置 | 使用时验证 | ✓ | ✓ | 手动编辑配置文件 |
| **OpenRouter** | 服务端（聚合平台） | API 验证 | ✓（聚合） | ✓ | 用户仪表板管理 |
| **Vercel AI SDK** | 开发者决定 | 开发者实现 | ✓ | ✓ | 依赖开发者 |
| **LobeChat** | 客户端 indexedDB | ✓ 探测验证 | ✓ | ✓ | UI 完整 CRUD |
| **Open WebUI** | 服务端数据库 | 可选验证 | ✓ | ✓ | UI 完整 CRUD |
| **ChatGPT/Claude** | 服务端加密存储 | 实时验证 | ✗ | ✗ | 平台管理 |

---

## 二、详细分析

### 1. Cursor

**存储方式**: 客户端本地配置文件（`~/.cursor/mcp_config.json` 等）

**安全机制**:
- Key 不离开用户设备
- 通过本地配置文件管理
- 支持环境变量注入

**验证方式**:
- 使用时验证，不预先探测
- 失败时显示错误信息

**多 Provider 支持**:
- 支持 OpenAI、Anthropic、Google 等
- 通过 MCP（Model Context Protocol）扩展
- 不支持自定义 base URL（主要针对主流 provider）

**UI/UX**:
- 设置页面直接配置
- 支持模型切换
- 状态指示器（绿色/红色）

---

### 2. Continue.dev

**存储方式**: 客户端配置文件（`~/.continue/config.json`）

**安全机制**:
- 纯客户端存储
- 支持环境变量覆盖
- 不向服务器发送任何 key

**验证方式**:
- 懒加载验证，首次使用时才检测
- 提供清晰的错误提示

**多 Provider 支持**:
```json
{
  "models": [{
    "title": "GPT-4",
    "provider": "openai",
    "apiBase": "https://custom-endpoint.com/v1",  // ✓ 支持自定义
    "apiKey": "$OPENAI_API_KEY"  // 环境变量
  }]
}
```

**UI/UX**:
- VS Code 扩展内配置
- 支持模型选择器
- 状态显示在状态栏

---

### 3. OpenRouter

**存储方式**: 服务端（用户账户系统）

**安全机制**:
- HTTPS 传输
- 服务端加密存储
- 支持使用限制和预算控制

**验证方式**:
- 实时 API 验证
- 提供余额和用量查询
- Webhook 通知

**多 Provider 支持**:
- **核心特性**: 聚合 100+ 模型
- 统一 API 端点
- 自动 fallback 和成本优化

**UI/UX**:
- Web 仪表板管理
- 模型排行榜
- 成本对比工具

---

### 4. Vercel AI SDK

**定位**: 框架层面，不提供存储方案

**推荐模式**:
```typescript
// 服务端环境变量（推荐）
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 或用户自定义（需自行实现安全存储）
const customProvider = createOpenAI({
  baseURL: userConfig.baseURL,
  apiKey: userConfig.apiKey,  // 需加密存储
});
```

**安全建议**:
- 默认使用环境变量
- 用户 key 需服务端加密
- 传输时用 HTTPS

---

### 5. LobeChat

**存储方式**: 客户端 indexedDB（自托管模式）

**安全机制**:
- 默认本地存储，key 不离设备
- 可选服务端加密模式
- 支持 Proxy 模式隐藏真实 key

**验证方式**:
- 连通性探测（发送测试请求）
- 实时状态反馈
- 错误重试机制

**多 Provider 支持**:
- OpenAI / Claude / Gemini / Perplexity / Bedrock / Azure / Mistral / Ollama
- ✓ 完整的自定义 base URL 支持
- 模型参数自定义配置

**UI/UX**:
- 设置页面统一管理
- Provider 切换器
- 模型选择器动态加载
- 状态指示（已连接/未连接/错误）

---

### 6. Open WebUI

**存储方式**: 服务端数据库（SQLite/PostgreSQL）

**安全机制**:
- 服务端加密存储
- 支持多用户隔离
- Admin 可管理全局 keys

**验证方式**:
- 可选的连通性测试
- 使用时验证
- 详细的错误日志

**多 Provider 支持**:
- Ollama、OpenAI、Anthropic、vLLM 等
- ✓ 自定义 endpoint
- 支持本地模型

**UI/UX**:
- Admin 面板管理
- 用户级 provider 配置
- 模型切换器
- 健康检查界面

---

## 三、关键发现和趋势

### 1. 存储位置两极分化

**客户端存储**（Cursor、Continue、LobeChat 默认）
- ✅ 优势: 零服务器风险，用户完全控制
- ❌ 劣势: 跨设备同步困难，无法实现协作

**服务端存储**（OpenRouter、Open WebUI、SaaS 平台）
- ✅ 优势: 跨设备可用，支持协作
- ❌ 劣势: 需要强加密，信任要求高

**趋势**: 混合模式正在兴起
- 默认本地存储
- 可选同步（用户自行决定）
- 提供"仅当前会话"选项

---

### 2. 验证策略

**立即探测**（LobeChat、Open WebUI）
- 用户配置后立即测试
- 提供即时反馈
- 适合正式配置场景

**延迟验证**（Cursor、Continue）
- 首次使用时才验证
- 减少配置阻力
- 适合开发工具

**最佳实践**: 提供"测试连接"按钮，但非强制

---

### 3. 自定义 Base URL 成为标配

**支持率**: 7/7 产品支持（Cursor 除外）

**格式标准**: OpenAI 兼容格式 `https://host/v1`

**用途**:
- 代理服务
- 私有部署
- 地域优化
- 调试环境

---

### 4. 多 Provider 支持模式

**聚合平台模式**（OpenRouter）:
- 一个 key 访问所有模型
- 统一计费
- 自动 fallback

**直连模式**（Cursor、LobeChat）:
- 用户管理每个 provider 的 key
- 更灵活但配置复杂

**建议**: 支持两种模式
- 默认: 用户配置自己的 keys
- 可选: 支持 OpenRouter 等聚合服务

---

## 四、对 VibeDocs 的推荐实践

### 架构建议

```
┌─────────────────────────────────────────────────────┐
│                   用户浏览器                          │
│  ┌──────────────────────────────────────────────┐  │
│  │  localStorage: Provider 配置（非敏感）         │  │
│  │  - Provider 类型                               │  │
│  │  - Base URL                                   │  │
│  │  - 模型选择                                   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────┐
│                  VibeDocs 服务端                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  数据库（加密存储）:                             │  │
│  │  - API Key（AES-256-GCM 加密）                 │  │
│  │  - 加密密钥由环境变量 MASTER_KEY 派生          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │ HTTPS + API Key
                         ▼
┌─────────────────────────────────────────────────────┐
│                  AI Provider                         │
│  - OpenAI                                           │
│  - Anthropic                                        │
│  - 自定义 endpoint                                  │
└─────────────────────────────────────────────────────┘
```

### 具体实现建议

#### 1. 安全存储

```typescript
// 服务端：加密存储 API Key
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY!;

function encryptApiKey(key: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

function decryptApiKey(encrypted: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    MASTER_KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

#### 2. 验证和连通性

```typescript
// 服务端 API: 验证 Provider 配置
async function validateProviderConfig(config: ProviderConfig): Promise<{
  valid: boolean;
  error?: string;
  models?: string[];
}> {
  try {
    // 发送轻量级测试请求
    const response = await fetch(`${config.baseURL}/models`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      valid: true,
      models: data.data?.map((m: any) => m.id) || [],
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

#### 3. UI/UX 设计

**配置入口**:
- 设置页面 > "AI Providers" 标签
- 或首次使用时的引导流程

**配置界面结构**:
```
┌─────────────────────────────────────────────────┐
│  AI Provider 配置                                 │
├─────────────────────────────────────────────────┤
│                                                   │
│  Provider: [OpenAI ▼]  （下拉选择）               │
│                                                   │
│  API Key:   [sk-......................] [👁]    │
│                                                   │
│  Base URL:  [https://api.openai.com/v1]          │
│             ☐ 使用自定义 endpoint                  │
│                                                   │
│  Model:     [gpt-4o ▼]    （动态加载模型列表）     │
│                                                   │
│  [测试连接]  [保存]                               │
│                                                   │
│  ─────────────────────────────────────────────   │
│  已配置的 Providers:                              │
│  • OpenAI (gpt-4o)              [删除]            │
│  • Anthropic (claude-sonnet-4)  [删除]            │
│                                                   │
└─────────────────────────────────────────────────┘
```

**状态指示**:
- 🟢 已连接且有效
- 🟡 未验证
- 🔴 连接失败

#### 4. 多 Provider 支持

**默认支持的 Provider**:
```typescript
const PREDEFINED_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: [], // 动态获取
  },
];
```

**自定义 Provider**:
- 支持用户添加"自定义 OpenAI 兼容" provider
- 仅需提供 Base URL 和 API Key
- 自动尝试获取模型列表（`/models` endpoint）

#### 5. Key 生命周期管理

**CRUD 操作**:
- Create: 设置页面添加新 provider
- Read: 列表展示，可编辑
- Update: 修改 key 或 base URL，自动重新验证
- Delete: 删除 provider，清除关联数据

**轮转支持**:
- 更新 key 时保留历史（用于审计）
- 标记 key 状态（活跃/已轮换）

**清理策略**:
- 用户注销时立即删除所有 keys
- 提供导出功能（让用户备份自己的配置）

---

### 数据模型建议

```sql
CREATE TABLE user_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_type VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'custom'
  
  -- 加密的 API Key
  api_key_encrypted TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  api_key_auth_tag TEXT NOT NULL,
  
  -- 配置
  base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  model VARCHAR(100) NOT NULL,
  
  -- 状态
  is_valid BOOLEAN DEFAULT NULL,  -- NULL = 未验证
  last_validated_at TIMESTAMP,
  validation_error TEXT,
  
  -- 元数据
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 安全：删除时级联
  ON DELETE CASCADE
);

CREATE INDEX idx_user_providers_user_id ON user_providers(user_id);
```

---

## 五、实施优先级

### P0（核心功能）
1. ✅ OpenAI + Anthropic 原生支持
2. ✅ 安全的服务端加密存储
3. ✅ 基础的配置 UI
4. ✅ 连通性验证

### P1（增强体验）
1. ✅ 自定义 Base URL 支持
2. ✅ 模型列表动态获取
3. ✅ 多 provider 同时配置
4. ✅ 状态指示器和错误提示

### P2（进阶功能）
1. ⚠️ OpenRouter 聚合支持
2. ⚠️ 成本追踪和限额
3. ⚠️ Provider 性能对比
4. ⚠️ Key 轮换提醒

---

## 六、参考资源

- [Cursor AI Models 文档](https://docs.cursor.com/features/ai-models)
- [OpenRouter 快速开始](https://openrouter.ai/docs/quick-start)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [LobeChat 设置文档](https://lobehub.com/docs/lobe-chat/settings)
- [Open WebUI 文档](https://docs.openwebui.com)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

**报告编写**: AI Research Agent
**更新时间**: 2026-04-14
