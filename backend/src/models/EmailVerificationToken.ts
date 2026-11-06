import { Schema, model, type Types } from 'mongoose';

/** One active email-verification OTP per user. Only an HMAC of the code is stored. */
export interface IEmailVerificationToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  createdAt: Date;
}

const schema = new Schema<IEmailVerificationToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, required: true, lowercase: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Keep the record a little past expiry so the resend cooldown still applies, then let Mongo remove it.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const EmailVerificationToken = model<IEmailVerificationToken>('EmailVerificationToken', schema);
