import { describe, expect, it } from 'vitest';
import { build{{class_name}}Fixture } from './fixtures/{{kebab_name}}.fixture';

describe('{{subject}}', () => {
  it('has a starter regression test', () => {
    expect(build{{class_name}}Fixture().label).toBe('{{subject}}');
  });
});
