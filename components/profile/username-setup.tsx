'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { setUsername } from './profile-client';

interface UsernameSetupProps {
  onComplete?: (username: string) => void;
}

export function UsernameSetup({ onComplete }: UsernameSetupProps) {
  const [username, setUsernameValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(value: string): string | null {
    if (value.length < 3) return '用户名至少 3 个字符';
    if (value.length > 64) return '用户名最多 64 个字符';
    if (!/^[a-zA-Z0-9-]+$/.test(value)) return '只能包含字母、数字和连字符';
    if (/^\d+$/.test(value)) return '用户名不能全是数字';
    return null;
  }

  async function handleSubmit() {
    const validationError = validate(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setChecking(true);
    setError(null);
    try {
      await setUsername(username);
      onComplete?.(username);
    } catch (err: any) {
      setError(err.message || '设置用户名失败');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">设置用户名</h3>
        <p className="text-xs text-muted-foreground">
          设置一个唯一的用户名，其他用户可以通过 /u/{'{'}用户名{'}'} 访问你的主页。
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            @
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsernameValue(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''));
              setError(null);
            }}
            placeholder="your-username"
            className="w-full rounded-md border border-input bg-card pl-8 pr-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={checking || !username}
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {checking ? '...' : '确认'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
