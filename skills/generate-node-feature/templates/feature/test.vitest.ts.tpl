import { describe, expect, it } from 'vitest';
import { build{{pascal_name}}Service } from '{{import_service_from_test}}';

describe('{{pascal_name}}Service', () => {
  it('returns a successful payload', async () => {
    const service = build{{pascal_name}}Service();
    const result = await service.execute({ id: 'test-id' });
    expect(result.ok).toBe(true);
    expect(result.feature).toBe('{{kebab_name}}');
  });
});
