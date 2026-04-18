import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { build{{pascal_name}}Service } from '{{import_service_from_test}}';

describe('{{pascal_name}}Service', () => {
  it('returns a successful payload', async () => {
    const service = build{{pascal_name}}Service();
    const result = await service.execute({ id: 'test-id' });
    assert.equal(result.ok, true);
    assert.equal(result.feature, '{{kebab_name}}');
  });
});
