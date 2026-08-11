import { handleVersionItem } from './_shared/version-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  return handleVersionItem(request, context, 'unit');
}

export const config = { path: '/api/units/:id/versions/:revision' };
