'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { ChatSkeleton } from '@/components/chat/ChatSkeleton';

const ChatView = dynamic(() => import('@/components/chat/ChatView').then((m) => m.ChatView), { ssr: false, loading: () => <ChatSkeleton /> });

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView conversationId={id} />;
}
