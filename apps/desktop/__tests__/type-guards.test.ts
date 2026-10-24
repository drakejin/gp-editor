import { isOfTypes } from '../src/lib/type-guards';

type Move = { readonly type: 'up' } | { readonly type: 'down'; readonly by: number };
type Action = Move | { readonly type: 'stop' };

describe('isOfTypes', () => {
  it('tells the actions of one kind from the others by their type', () => {
    // Arrange
    const isMove = isOfTypes<Move>({ up: true, down: true });
    const actions: readonly Action[] = [{ type: 'up' }, { type: 'stop' }, { type: 'down', by: 2 }];

    // Act
    const moves = actions.filter(isMove);

    // Assert
    expect(moves).toEqual([{ type: 'up' }, { type: 'down', by: 2 }]);
  });

  it('reads only its own types, not ones an object inherits', () => {
    // Arrange
    const isMove = isOfTypes<Move>({ up: true, down: true });

    // Act / Assert
    expect(isMove({ type: 'toString' })).toBe(false);
  });
});
