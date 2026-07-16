import { describe, expect, it } from 'vitest';
import type { Batch, StockMovement } from '../types';
import {
  getPrimaryMovement,
  getRestorableOperationIds,
  groupMovements,
} from './movements';

const createdAt = '2026-07-16T00:00:00.000Z';

function movement(
  input: Partial<StockMovement> & Pick<StockMovement, 'id' | 'type'>,
): StockMovement {
  return {
    productId: 'product',
    batchId: 'batch',
    change: -1,
    beforeQuantity: 2,
    afterQuantity: 1,
    createdAt,
    ...input,
  };
}

function batch(input?: Partial<Batch>): Batch {
  return {
    id: 'batch',
    productId: 'product',
    quantity: 1,
    initialQuantity: 2,
    expiryDate: '2026-08-10',
    expiryPrecision: 'day',
    createdAt,
    updatedAt: createdAt,
    ...input,
  };
}

describe('movement operations', () => {
  it('groups new movements by operation id and keeps legacy movements separate', () => {
    const groups = groupMovements([
      movement({ id: 'consume-1', operationId: 'operation', type: 'consume' }),
      movement({
        id: 'archive',
        operationId: 'operation',
        type: 'archive',
        batchId: undefined,
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
      }),
      movement({ id: 'legacy-1', operationId: undefined, type: 'consume' }),
      movement({ id: 'legacy-2', operationId: undefined, type: 'consume' }),
    ]);

    expect(groups.map((group) => [group.id, group.movements.length])).toEqual([
      ['operation', 2],
      ['legacy-1', 1],
      ['legacy-2', 1],
    ]);
    expect(getPrimaryMovement(groups[0]).type).toBe('consume');
  });

  it('only marks an unchanged latest operation as restorable', () => {
    const source = movement({
      id: 'consume',
      operationId: 'operation',
      type: 'consume',
      batchAfter: {
        quantity: 1,
        expiryDate: '2026-08-10',
        expiryPrecision: 'day',
      },
    });

    expect(getRestorableOperationIds([source], [batch()])).toEqual(new Set(['operation']));
    expect(
      getRestorableOperationIds([source], [batch({ updatedAt: '2026-07-16T01:00:00.000Z' })]),
    ).toEqual(new Set());
  });

  it('removes an operation from the restorable set after a restore record exists', () => {
    const source = movement({ id: 'discard', operationId: 'operation', type: 'discard' });
    const restore = movement({
      id: 'restore',
      operationId: 'restore-operation',
      type: 'restore',
      change: 1,
      beforeQuantity: 1,
      afterQuantity: 2,
      revertsMovementId: source.id,
      createdAt: '2026-07-16T01:00:00.000Z',
    });

    expect(getRestorableOperationIds([restore, source], [batch()])).toEqual(new Set());
  });
});
