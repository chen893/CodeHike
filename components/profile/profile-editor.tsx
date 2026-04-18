'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchProfile, updateProfile } from './profile-client';

interface ProfileEditorProps {
  initialData: {
    name: string | null;
    bio: string | null;
  };
}

export function ProfileEditor({ initialData }: ProfileEditorProps) {
  const [name, setName] = useState(initialData.name ?? '');
  const [bio, setBio] = useState(initialData.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateProfile({ name: name || undefined, bio: bio || undefined });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">编辑个人资料</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            显示名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="你的显示名称"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            个人简介
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="简单介绍一下自己..."
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">已保存</p>}
      <Button
        onClick={handleSave}
        disabled={saving}
        size="sm"
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {saving ? '保存中...' : '保存'}
      </Button>
    </div>
  );
}
