'use client';

import dynamic from 'next/dynamic';
import { ChatSkeleton } from '@/components/chat/ChatSkeleton';

// Code-split the chat UI (markdown + highlighting are the heaviest client modules).
const ChatView = dynamic(() => import('@/components/chat/ChatView').then((m) => m.ChatView), { ssr: false, loading: () => <ChatSkeleton /> });

export default function NewChatPage() {
  return <ChatView />;
}
