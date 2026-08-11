import { apiPatch } from '@/api/client';
import type { Block, Cover, Unit } from '@/schemas';

export function patchUnit(
  id: string,
  body: {
    cover?: Cover | null;
    blocks?: Block[];
    description?: string;
  }
): Promise<Unit> {
  return apiPatch(`/api/units/${id}`, body);
}
