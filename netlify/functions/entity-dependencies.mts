import { handleDependencies } from './_shared/lifecycle-routes.mts';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

export default async function handler(request: Request, context: FunctionContext): Promise<Response> {
  return handleDependencies(request, context);
}

export const config = {
  path: [
    '/api/lessons/:id/dependencies',
    '/api/units/:id/dependencies',
    '/api/classes/:id/dependencies',
    '/api/media/:id/dependencies',
    '/api/lesson-templates/:id/dependencies',
    '/api/unit-templates/:id/dependencies',
    '/api/compositions/:id/dependencies'
  ]
};
