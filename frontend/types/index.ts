export type Role = 'user' | 'admin';
export type Theme = 'system' | 'light' | 'dark';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'hi';

export interface Preferences {
  theme: Theme;
  language: Language;
  defaultModel: string | null;
  sendOnEnter: boolean;
  showTimestamps: boolean;
  autoTitle: boolean;
  customInstructions: string;
  temperature: number | null;
  fontSize: 'small' | 'medium' | 'large';
  chatWidth: 'narrow' | 'default' | 'wide';
  codeWrap: boolean;
  showTokenUsage: boolean;
  autoScroll: boolean;
  reduceMotion: boolean;
  suggestedPrompts: boolean;
  nickname: string;
  occupation: string;
  aboutYou: string;
  notifyNewSignIn: boolean;
  notifyPasswordChange: boolean;
}

export interface AuthConfig {
  requireEmailVerification: boolean;
  registrationEnabled: boolean;
  otp: { length: number; ttlMinutes: number; maxAttempts: number; resendCooldownSeconds: number };
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  hasUploadedAvatar: boolean;
  twoFactorEnabled: boolean;
  passwordChangedAt: string | null;
  role: Role;
  emailVerified: boolean;
  blocked: boolean;
  preferences: Preferences;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  archived: boolean;
  shared: boolean;
  shareId: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  kind: 'pdf' | 'txt' | 'docx' | 'image';
  size: number;
}

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';
export type Rating = 'like' | 'dislike';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: Attachment[];
  feedback: { rating: Rating; comment: string | null } | null;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  model: string | null;
  status: MessageStatus;
  error: string | null;
  editedAt: string | null;
  createdAt: string;
}

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  provider: string;
  vision: boolean;
  available: boolean;
}

export interface UserSettingsResponse {
  preferences: Preferences;
  models: ModelOption[];
  defaultModel: string | null;
  appName: string;
  limits: { dailyMessagesPerUser: number; messagesToday: number };
}

export interface UploadedFile extends Attachment {
  hasText: boolean;
  preview: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface ModelConfig {
  id: string;
  label: string;
  provider: string;
  description: string;
  enabled: boolean;
  vision: boolean;
  maxOutputTokens: number;
}

export interface AppSettings {
  appName: string;
  models: ModelConfig[];
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  maxContextMessages: number;
  maxContextTokens: number;
  limits: { dailyMessagesPerUser: number; dailyTokensPerUser: number; aiRequestsPerMinute: number };
  registrationEnabled: boolean;
  allowAdminConversationAccess: boolean;
  aiTitleGeneration: boolean;
  updatedAt: string;
}

export interface Paginated {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUser extends User {
  conversationCount: number;
  tokensUsed: number;
}

export interface LoginChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  email: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

export interface UserStats {
  conversations: number;
  archived: number;
  shared: number;
  messages: number;
  sentMessages: number;
  files: number;
  feedback: { likes: number; dislikes: number };
  tokens: { total: number; last30Days: number };
  activeDays30: number;
  activity: { date: string; messages: number }[];
  memberSince: string;
}
