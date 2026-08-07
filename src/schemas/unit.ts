import { z } from 'zod';
import { CommonFields } from './common';

export const UnitSchema = z.object({
  ...CommonFields,
  type: z.literal('unit'),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  lesson_ids: z.array(z.string().min(1)),
  primary_term: z.number().int().positive().optional(),
  description: z.string().optional()
});

export type Unit = z.infer<typeof UnitSchema>;
