import { z } from 'zod';
import { email, name, password } from './common';

export const registerSchema = z.object({ name, email, password });
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });
export const forgotPasswordSchema = z.object({ email });
export const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');
export const verifyResetCodeSchema = z.object({ email, code: otpCode });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });
export const verifyEmailSchema = z.object({ code: otpCode });
export const challengeSchema = z.object({ challengeToken: z.string().min(20).max(200) });
export const loginVerifySchema = z.object({ challengeToken: z.string().min(20).max(200), code: otpCode });
