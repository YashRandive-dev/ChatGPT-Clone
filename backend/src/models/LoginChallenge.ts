import { Schema, model, type Types } from 'mongoose';

/** Pending two-step sign-in: password was correct, an emailed code is still required. */
export interface ILoginChallenge {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  createdAt: Date;
}

const schema = new Schema<ILoginChallenge>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

export const LoginChallenge = model<ILoginChallenge>('LoginChallenge', schema);
