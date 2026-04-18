import { describe, expect, it } from 'vitest';
import { read{{class_name}}Config } from '../../src/config/{{kebab_name}}';

describe('read{{class_name}}Config', () => {
  it('returns the configured value shape', () => {
    expect(read{{class_name}}Config()).toHaveProperty('source', '{{kebab_name}}');
  });
});
