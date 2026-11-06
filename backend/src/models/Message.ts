import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';
export type Rating = 'like' | 'dislike';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MessageRole;
  content: string;
  attachments: Types.ObjectId[];
  feedback: { rating: Rating | null; comment: string | null };
  tokenUsage: TokenUsage | null;
  model: string | null;
  status: MessageStatus;
  error: string | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, default: '', maxlength: 200_000 },
    attachments: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    feedback: {
      rating: { type: String, enum: ['like', 'dislike', null], default: null },
      comment: { type: String, default: null, maxlength: 2000 },
    },
    tokenUsage: {
      type: new Schema<TokenUsage>(
        { promptTokens: Number, completionTokens: Number, totalTokens: Number },
        { _id: false },
      ),
      default: null,
    },
    model: { type: String, default: null },
    status: { type: String, enum: ['complete', 'streaming', 'stopped', 'error'], default: 'complete' },
    error: { type: String, default: null },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1, _id: 1 });
messageSchema.index({ userId: 1, createdAt: -1 });
messageSchema.index({ content: 'text' });

export type MessageDoc = HydratedDocument<IMessage>;
export const Message = model<IMessage>('Message', messageSchema);
