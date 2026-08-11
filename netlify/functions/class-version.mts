import { handleVersionItem } from './_shared/version-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  return handleVersionItem(request, context, 'class_homepage');
}

export const config = { path: '/api/classes/:id/versions/:revision' };
