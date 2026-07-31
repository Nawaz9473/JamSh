import { z } from 'zod';

// Form validation schemas
export const signUpSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const otpLoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const otpVerifySchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  token: z.string().length(6, 'Verification code must be 6 digits'),
});

export const profileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  display_name: z.string().max(50, 'Name must be less than 50 characters').nullable(),
  bio: z.string().max(160, 'Bio must be less than 160 characters').nullable(),
  website: z.union([z.string().url('Please enter a valid URL'), z.string().length(0)]).nullable().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const postSchema = z.object({
  content: z.string().max(1000, 'Post content cannot exceed 1000 characters').nullable(),
  type: z.enum(['text', 'image', 'video', 'multiple']),
  visibility: z.enum(['public', 'private']),
  mediaUrls: z.array(z.string()).max(10, 'You can upload up to 10 media items'),
});

export type PostInput = z.infer<typeof postSchema>;

// Shared helper functions
export function formatThunderCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return count.toString();
}

export function getDisplayName(profile: { username: string; display_name: string | null }): string {
  return profile.display_name && profile.display_name.trim().length > 0
    ? profile.display_name
    : `@${profile.username}`;
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
