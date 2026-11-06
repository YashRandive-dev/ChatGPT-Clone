'use client';

import { useRouter } from 'next/navigation';
import { HelpCircle, LogOut, Settings, Shield, User as UserIcon } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { Avatar } from '@/components/ui/Misc';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { resetChatStore } from '@/lib/chatStore';
import { cn } from '@/lib/utils';

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const { t } = useT();
  const router = useRouter();
  if (!user) return null;

  return (
    <Menu
      side="top"
      align="start"
      className="w-full"
      trigger={({ toggle }) => (
        <button onClick={toggle} className={cn('flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-hover', collapsed && 'justify-center')} aria-label="Account menu">
          <Avatar name={user.name} src={user.avatar} size={30} />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
              <span className="block truncate text-xs text-muted">{user.role === 'admin' ? 'Administrator' : user.email}</span>
            </span>
          )}
        </button>
      )}
      items={[
        { label: t('menu.profile'), icon: <UserIcon className="h-4 w-4" />, onSelect: () => router.push('/profile') },
        { label: t('menu.settings'), icon: <Settings className="h-4 w-4" />, onSelect: () => router.push('/settings') },
        ...(user.role === 'admin' ? [{ label: t('menu.admin'), icon: <Shield className="h-4 w-4" />, onSelect: () => router.push('/admin') }] : []),
        { label: t('menu.help'), icon: <HelpCircle className="h-4 w-4" />, onSelect: () => router.push('/help') },
        'separator',
        {
          label: t('menu.logout'),
          icon: <LogOut className="h-4 w-4" />,
          danger: true,
          onSelect: () => {
            resetChatStore();
            void logout();
          },
        },
      ]}
    />
  );
}
