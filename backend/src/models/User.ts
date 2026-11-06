import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type Role = 'user' | 'admin';
export type ThemePref = 'system' | 'light' | 'dark';

export interface UserPreferences {
  theme: ThemePref;
  language: string;
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
  /** Personalization sent to the AI */
  nickname: string;
  occupation: string;
  aboutYou: string;
  /** Security notification emails */
  notifyNewSignIn: boolean;
  notifyPasswordChange: boolean;
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  avatar: string | null;
  /** Stored file name of an uploaded avatar (takes precedence over `avatar` URL). */
  avatarFile: string | null;
  twoFactorEnabled: boolean;
  role: Role;
  emailVerified: boolean;
  blocked: boolean;
  preferences: UserPreferences;
  lastActiveAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'hi'] as const;

const preferencesSchema = new Schema<UserPreferences>(
  {
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    language: { type: String, enum: SUPPORTED_LANGUAGES, default: 'en' },
    defaultModel: { type: String, default: null },
    sendOnEnter: { type: Boolean, default: true },
    showTimestamps: { type: Boolean, default: true },
    autoTitle: { type: Boolean, default: true },
    customInstructions: { type: String, default: '', maxlength: 2000 },
    temperature: { type: Number, default: null, min: 0, max: 2 },
    fontSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    chatWidth: { type: String, enum: ['narrow', 'default', 'wide'], default: 'default' },
    codeWrap: { type: Boolean, default: false },
    showTokenUsage: { type: Boolean, default: false },
    autoScroll: { type: Boolean, default: true },
    reduceMotion: { type: Boolean, default: false },
    suggestedPrompts: { type: Boolean, default: true },
    nickname: { type: String, default: '', maxlength: 50, trim: true },
    occupation: { type: String, default: '', maxlength: 100, trim: true },
    aboutYou: { type: String, default: '', maxlength: 1500 },
    notifyNewSignIn: { type: Boolean, default: true },
    notifyPasswordChange: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    avatarFile: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    emailVerified: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false, index: true },
    preferences: { type: preferencesSchema, default: () => ({}) },
    lastActiveAt: { type: Date, default: null, index: true },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ name: 'text', email: 'text' });
userSchema.index({ createdAt: -1 });

export type UserDoc = HydratedDocument<IUser>;
export const User = model<IUser>('User', userSchema);

/** Shape returned to clients. Never includes the password hash. */
export function serializeUser(user: IUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatar: user.avatarFile ? `/api/users/${user._id.toString()}/avatar?v=${new Date(user.updatedAt).getTime()}` : user.avatar,
    hasUploadedAvatar: Boolean(user.avatarFile),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    passwordChangedAt: user.passwordChangedAt,
    role: user.role,
    emailVerified: user.emailVerified,
    blocked: user.blocked,
    preferences: user.preferences,
    lastActiveAt: user.lastActiveAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
