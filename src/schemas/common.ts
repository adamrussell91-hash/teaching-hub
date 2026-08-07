import { z } from 'zod';

export const StatusSchema = z.enum(['active', 'archived', 'trashed']);
export const IsoDateSchema = z.string().datetime();

export const CommonFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};
