import type { Batch, BatchMovementSnapshot, MovementType, StockMovement } from '../types';

const reversibleMovementTypes = new Set<MovementType>(['consume', 'discard', 'adjust']);

export interface MovementGroup {
  id: string;
  movements: StockMovement[];
}

export function getMovementOperationId(movement: StockMovement): string {
  return movement.operationId ?? movement.id;
}

export function groupMovements(movements: StockMovement[]): MovementGroup[] {
  const groups = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    const operationId = getMovementOperationId(movement);
    const group = groups.get(operationId);
    if (group) group.push(movement);
    else groups.set(operationId, [movement]);
  }
  return Array.from(groups, ([id, groupedMovements]) => ({
    id,
    movements: groupedMovements,
  }));
}

function batchMatchesSnapshot(batch: Batch, snapshot: BatchMovementSnapshot): boolean {
  return (
    batch.quantity === snapshot.quantity &&
    batch.expiryDate === snapshot.expiryDate &&
    batch.expiryTime === snapshot.expiryTime &&
    batch.expiryPrecision === snapshot.expiryPrecision &&
    batch.purchaseDate === snapshot.purchaseDate &&
    batch.note === snapshot.note &&
    batch.completedAt === snapshot.completedAt
  );
}

export function getRestorableOperationIds(
  movements: StockMovement[],
  batches: Batch[],
): Set<string> {
  const restoredMovementIds = new Set(
    movements
      .filter((movement) => movement.type === 'restore' && movement.revertsMovementId)
      .map((movement) => movement.revertsMovementId!),
  );
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
  const restorable = new Set<string>();

  for (const group of groupMovements(movements)) {
    const targets = group.movements.filter(
      (movement) => reversibleMovementTypes.has(movement.type) && movement.batchId,
    );
    if (targets.length === 0 || targets.some((movement) => restoredMovementIds.has(movement.id))) {
      continue;
    }
    if (
      targets.every((movement) => {
        const batch = batchesById.get(movement.batchId!);
        if (!batch || batch.updatedAt !== movement.createdAt) return false;
        return movement.batchAfter
          ? batchMatchesSnapshot(batch, movement.batchAfter)
          : batch.quantity === movement.afterQuantity;
      })
    ) {
      restorable.add(group.id);
    }
  }

  return restorable;
}

export function getPrimaryMovement(group: MovementGroup): StockMovement {
  return (
    group.movements.find((movement) => movement.type === 'restore') ??
    group.movements.find((movement) => reversibleMovementTypes.has(movement.type)) ??
    group.movements.find((movement) => movement.type === 'add') ??
    group.movements[0]
  );
}
