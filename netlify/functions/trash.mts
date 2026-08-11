import { handleTrashList } from './_shared/lifecycle-routes.mts';

export default async function handler(request: Request): Promise<Response> {
  return handleTrashList(request);
}

export const config = { path: '/api/trash' };
