import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IConversation {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  model: string;
  pinned: boolean;
  archived: boolean;
  shareId: string | null;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200, default: 'New chat' },
    model: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    shareId: { type: String, default: null },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// Sidebar listing: newest activity first, scoped per user.
conversationSchema.index({ userId: 1, archived: 1, updatedAt: -1, _id: -1 });
conversationSchema.index({ userId: 1, title: 1 });
conversationSchema.index({ shareId: 1 }, { unique: true, partialFilterExpression: { shareId: { $type: 'string' } } });

export type ConversationDoc = HydratedDocument<IConversation>;
export const Conversation = model<IConversation>('Conversation', conversationSchema);

export function serializeConversation(c: IConversation) {
  return {
    id: c._id.toString(),
    title: c.title,
    model: c.model,
    pinned: c.pinned,
    archived: Boolean(c.archived),
    shared: Boolean(c.shareId),
    shareId: c.shareId,
    messageCount: c.messageCount,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
