import { describe, expect, it } from 'vitest';
import { createId } from './createId';

describe('createId', () => {
  it('uses randomUUID when it is available', () => {
    expect(createId({ randomUUID: () => 'native-id' })).toBe('native-id');
  });

  it('creates a UUID v4 with getRandomValues on insecure HTTP origins', () => {
    const id = createId({
      getRandomValues(values) {
        values.forEach((_, index) => {
          values[index] = index;
        });
        return values;
      },
    });

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
