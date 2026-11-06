import { Schema, model, type Types } from 'mongoose';
import type { Rating } from './Message';

export interface IFeedback {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  messageId: Types.ObjectId;
  conversationId: Types.ObjectId;
  rating: Rating;
  comment: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    rating: { type: String, enum: ['like', 'dislike'], required: true },
    comment: { type: String, default: null, maxlength: 2000 },
    model: { type: String, default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ userId: 1, messageId: 1 }, { unique: true });
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ rating: 1, createdAt: -1 });

export const Feedback = model<IFeedback>('Feedback', feedbackSchema);
