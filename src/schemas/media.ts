import { z } from 'zod';
import { CommonFields } from './common';

export const MediaProviderSchema = z.enum(['external', 'google_drive']);
export const MediaTypeSchema = z.enum(['pdf', 'image', 'video', 'link', 'other']);

export const MediaSchema = z.object({
  ...CommonFields,
  type: z.literal('media'),
  provider: MediaProviderSchema,
  media_type: MediaTypeSchema,
  mime_type: z.string().min(1).optional(),
  file_name: z.string().min(1).optional(),
  preview_url: z.string().min(1).optional(),
  download_url: z.string().min(1).optional(),
  thumbnail_url: z.string().min(1).optional()
});

export type Media = z.infer<typeof MediaSchema>;
