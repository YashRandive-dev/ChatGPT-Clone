import { Schema, model, type Types } from 'mongoose';

export interface ModelConfig {
  id: string;
  label: string;
  provider: string;
  description: string;
  enabled: boolean;
  vision: boolean;
  maxOutputTokens: number;
}

export interface UsageLimits {
  /** Max user messages per user per rolling 24h. 0 = unlimited. */
  dailyMessagesPerUser: number;
  /** Max tokens per user per rolling 24h. 0 = unlimited. */
  dailyTokensPerUser: number;
  /** Requests per minute per user to AI endpoints. */
  aiRequestsPerMinute: number;
}

export interface IAppSettings {
  _id: Types.ObjectId;
  key: 'global';
  appName: string;
  models: ModelConfig[];
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  maxContextMessages: number;
  maxContextTokens: number;
  limits: UsageLimits;
  registrationEnabled: boolean;
  allowAdminConversationAccess: boolean;
  aiTitleGeneration: boolean;
  /** The AI_MODELS value the catalog was last synced from (see syncModelsFromEnv). */
  modelsSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const modelConfigSchema = new Schema<ModelConfig>(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    provider: { type: String, default: 'openai' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    vision: { type: Boolean, default: false },
    maxOutputTokens: { type: Number, default: 4096 },
  },
  { _id: false },
);

const settingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, default: 'global', unique: true },
    appName: { type: String, default: 'Kairo' },
    models: { type: [modelConfigSchema], default: [] },
    defaultModel: { type: String, required: true },
    systemPrompt: {
      type: String,
      default:
        'You are Kairo, a helpful, accurate and friendly AI assistant. Format answers with Markdown when it improves readability. Use fenced code blocks with a language tag for code. Be concise unless the user asks for depth. If you are unsure about something, say so.',
    },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    maxTokens: { type: Number, default: 2048, min: 64, max: 32000 },
    maxContextMessages: { type: Number, default: 30, min: 2, max: 200 },
    maxContextTokens: { type: Number, default: 12000, min: 500, max: 200000 },
    limits: {
      dailyMessagesPerUser: { type: Number, default: 200 },
      dailyTokensPerUser: { type: Number, default: 0 },
      aiRequestsPerMinute: { type: Number, default: 20 },
    },
    registrationEnabled: { type: Boolean, default: true },
    allowAdminConversationAccess: { type: Boolean, default: false },
    aiTitleGeneration: { type: Boolean, default: true },
    modelsSource: { type: String, default: null },
  },
  { timestamps: true },
);

export const AppSettings = model<IAppSettings>('AppSettings', settingsSchema);
