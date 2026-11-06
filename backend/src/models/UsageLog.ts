import { Schema, model, type Types } from 'mongoose';

export type UsageType = 'chat' | 'title';
export type UsageStatus = 'success' | 'stopped' | 'error';

export interface IUsageLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: Types.ObjectId | null;
  messageId: Types.ObjectId | null;
  provider: string;
  model: string;
  type: UsageType;
  status: UsageStatus;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  error: string | null;
  createdAt: Date;
}

const usageLogSchema = new Schema<IUsageLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    type: { type: String, enum: ['chat', 'title'], default: 'chat' },
    status: { type: String, enum: ['success', 'stopped', 'error'], default: 'success' },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

usageLogSchema.index({ createdAt: -1 });
usageLogSchema.index({ userId: 1, createdAt: -1 });
usageLogSchema.index({ model: 1, createdAt: -1 });

export const UsageLog = model<IUsageLog>('UsageLog', usageLogSchema);
