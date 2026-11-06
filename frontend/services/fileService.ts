import { del, uploadWithProgress } from '@/lib/api';
import type { UploadedFile } from '@/types';

export const MAX_UPLOAD_MB = 10;
export const ACCEPTED_TYPES = '.pdf,.txt,.md,.csv,.json,.docx,.png,.jpg,.jpeg,.gif,.webp';
const ACCEPTED_EXT = ACCEPTED_TYPES.split(',');

export function validateFile(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ACCEPTED_EXT.includes(ext)) return `"${file.name}" is not a supported file type`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `"${file.name}" is larger than ${MAX_UPLOAD_MB} MB`;
  if (file.size === 0) return `"${file.name}" is empty`;
  return null;
}

export const fileService = {
  upload: (file: File, onProgress: (pct: number) => void, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return uploadWithProgress<{ file: UploadedFile }>('/api/files/upload', form, onProgress, signal);
  },
  remove: (id: string) => del(`/api/files/${id}`),
};
