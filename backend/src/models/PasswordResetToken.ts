import { Schema, model, type Types } from 'mongoose';

/**
 * Password reset by OTP:
 *  1. a 6-digit code is emailed (codeHash, attempts, expiresAt)
 *  2. a correct code is exchanged for a one-time reset token (resetTokenHash, resetExpiresAt)
 *  3. the reset token sets the new password (usedAt)
 */
export interface IPasswordResetToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  verifiedAt: Date | null;
  resetTokenHash: string | null;
  resetExpiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}

const schema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: () => new Date() },
    verifiedAt: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetExpiresAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ resetTokenHash: 1 }, { unique: true, partialFilterExpression: { resetTokenHash: { $type: 'string' } } });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const PasswordResetToken = model<IPasswordResetToken>('PasswordResetToken', schema);
