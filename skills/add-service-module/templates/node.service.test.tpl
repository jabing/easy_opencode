import { describe, expect, it } from 'vitest';
import { {{class_name}}Service } from '../../src/services/{{kebab_name}}.service';

describe('{{class_name}}Service', () => {
  it('returns a starter result', () => {
    const service = new {{class_name}}Service();
    expect(service.execute()).toEqual({ ok: true, source: '{{kebab_name}}' });
  });
});
