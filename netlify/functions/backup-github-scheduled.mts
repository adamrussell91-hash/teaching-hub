import { GITHUB_BACKUP_SCHEDULE } from '../../src/export/github-backup.ts';
import { GithubBackupError } from '../../src/export/github-backup.ts';
import { pushStoreArchiveToGithub } from './_shared/github-archive-backup.mts';
import { getContentStore } from './_shared/blobs.mts';
import { isConfigured } from './_shared/http.mts';

export default async function handler(): Promise<Response> {
  const env = process.env;
  if (!isConfigured(env)) {
    return Response.json({ ok: false, skipped: true, reason: 'misconfigured' }, { status: 503 });
  }

  try {
    const outcome = await pushStoreArchiveToGithub({
      store: getContentStore(),
      env
    });
    if (outcome.skipped) {
      return Response.json({ ok: true, skipped: true, reason: 'backup_unconfigured' });
    }
    return Response.json({ ok: true, skipped: false, data: outcome.result });
  } catch (err) {
    const message = err instanceof GithubBackupError ? err.message : 'Unable to commit the GitHub backup';
    return Response.json({ ok: false, skipped: false, error: message }, { status: 502 });
  }
}

export const config = { schedule: GITHUB_BACKUP_SCHEDULE };
