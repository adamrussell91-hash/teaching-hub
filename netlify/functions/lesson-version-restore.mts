import { handleVersionRestore } from './_shared/version-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  return handleVersionRestore(request, context, 'lesson');
}

export const config = { path: '/api/lessons/:id/versions/:revision/restore' };
