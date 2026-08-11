import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';

export const UnitSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('unit'),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  lesson_ids: z.array(z.string().min(1)),
  primary_term: z.number().int().positive().optional(),
  description: z.string().optional(),
  blocks: z.array(BlockSchema).optional()
});

export type Unit = z.infer<typeof UnitSchema>;
