import { z } from 'zod';
import { Types } from 'mongoose';

export const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), { message: 'Invalid id' });

export const idParams = z.object({ id: objectId });

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/i, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const name = z.string().trim().min(1, 'Name is required').max(80, 'Name is too long');
