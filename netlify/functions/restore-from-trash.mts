import { handleRestoreFromTrash } from './_shared/lifecycle-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  return handleRestoreFromTrash(request, context);
}

export const config = {
  path: [
    '/api/lessons/:id/restore-from-trash',
    '/api/units/:id/restore-from-trash',
    '/api/classes/:id/restore-from-trash',
    '/api/media/:id/restore-from-trash',
    '/api/lesson-templates/:id/restore-from-trash',
    '/api/unit-templates/:id/restore-from-trash',
    '/api/compositions/:id/restore-from-trash'
  ]
};
