import { describe, expect, it, vi } from 'vitest';
import { mountNotionImport } from '@/teacher/import-notion';

describe('mountNotionImport', () => {
  it('starts a transfer from the file input with no confirm card', async () => {
    const button = document.createElement('button');
    const host = document.createElement('div');
    host.append(button);
    const status = document.createElement('p');
    host.append(status);
    const run = vi.fn().mockResolvedValue({ imported: 2, updated: 0, failed: 0, errors: [] });
    const onMutated = vi.fn().mockResolvedValue(undefined);

    const control = mountNotionImport(button, {
      unitId: 'unit_1',
      getExisting: () => [],
      status,
      onMutated,
      run
    });

    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(control.input.accept).toContain('.zip');

    const zip = new File([new Uint8Array([80, 75])], 'export.zip', { type: 'application/zip' });
    Object.defineProperty(control.input, 'files', { value: [zip], configurable: true });
    control.input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
    expect(run.mock.calls[0][0].unitId).toBe('unit_1');
    expect(status.textContent).toBe('Imported 2 pages.');
    expect(onMutated).toHaveBeenCalled();
    expect(host.querySelector('.confirm-card')).toBeNull();

    control.dispose();
  });
});
