import { useCallback, useReducer, useRef } from 'react';

/**
 * Undo/redo for plain JSON-serialisable snapshots.
 * Call commit() when an edit is finished (slider released, drag ended),
 * not on every intermediate value.
 */
export function useHistory<T>() {
  const stack = useRef<string[]>([]);
  const index = useRef(-1);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const reset = useCallback((state: T) => {
    stack.current = [JSON.stringify(state)];
    index.current = 0;
    rerender();
  }, []);

  const commit = useCallback((state: T) => {
    const json = JSON.stringify(state);
    if (stack.current[index.current] === json) return;
    stack.current = stack.current.slice(0, index.current + 1);
    stack.current.push(json);
    index.current++;
    rerender();
  }, []);

  const step = useCallback((dir: -1 | 1): T | null => {
    const next = index.current + dir;
    if (next < 0 || next >= stack.current.length) return null;
    index.current = next;
    rerender();
    return JSON.parse(stack.current[next]) as T;
  }, []);

  return {
    reset,
    commit,
    undo: useCallback(() => step(-1), [step]),
    redo: useCallback(() => step(1), [step]),
    canUndo: index.current > 0,
    canRedo: index.current < stack.current.length - 1,
  };
}
