import { describe, expect, it } from 'vitest';
import { formatBytes, groupByDate, initials } from '@/lib/utils';
import { passwordStrength, validateEmail, validatePassword } from '@/lib/validation';
import { validateFile } from '@/services/fileService';

describe('groupByDate', () => {
  it('groups conversations into date buckets with pinned first', () => {
    const now = new Date('2026-06-15T12:00:00');
    const at = (d: string) => new Date(d).toISOString();
    const groups = groupByDate(
      [
        { id: 'a', updatedAt: at('2026-06-15T09:00:00') },
        { id: 'b', updatedAt: at('2026-06-14T09:00:00') },
        { id: 'c', updatedAt: at('2026-06-11T09:00:00') },
        { id: 'd', updatedAt: at('2026-05-25T09:00:00') },
        { id: 'e', updatedAt: at('2025-01-01T09:00:00') },
        { id: 'p', updatedAt: at('2024-01-01T09:00:00'), pinned: true },
      ],
      now,
    );
    expect(groups.today.map((x) => x.id)).toEqual(['a']);
    expect(groups.yesterday.map((x) => x.id)).toEqual(['b']);
    expect(groups.previous7.map((x) => x.id)).toEqual(['c']);
    expect(groups.previous30.map((x) => x.id)).toEqual(['d']);
    expect(groups.older.map((x) => x.id)).toEqual(['e']);
    expect(groups.pinned.map((x) => x.id)).toEqual(['p']);
  });
});

describe('validation helpers', () => {
  it('validates emails and passwords like the backend', () => {
    expect(validateEmail('nope')).toBeTruthy();
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('longpassword')).toMatch(/number/);
    expect(validatePassword('longpass1')).toBeNull();
    expect(passwordStrength('Abcdefgh1234!').score).toBe(4);
  });

  it('validates attachments before upload', () => {
    expect(validateFile(new File(['x'], 'a.exe'))).toMatch(/not a supported/);
    expect(validateFile(new File([], 'a.txt'))).toMatch(/empty/);
    expect(validateFile(new File(['hello'], 'notes.txt'))).toBeNull();
  });

  it('formats helpers', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(initials('Ada Lovelace')).toBe('AL');
  });
});
