'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { UserSettingsResponse } from '@/types';
import { useAuth } from '@/lib/auth';

/** User preferences + model catalog, cached by SWR. */
export function useUserSettings() {
  const { user } = useAuth();
  return useSWR<UserSettingsResponse>(user ? '/api/settings' : null, fetcher, { revalidateOnFocus: false, dedupingInterval: 30_000 });
}
