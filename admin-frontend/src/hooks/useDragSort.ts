import { useCallback, useState, type DragEvent } from 'react';

export interface DragSortRowProps {
  draggable: boolean;
  onDragStart?: (e: DragEvent<HTMLTableRowElement>) => void;
  onDragOver?: (e: DragEvent<HTMLTableRowElement>) => void;
  onDrop?: (e: DragEvent<HTMLTableRowElement>) => void;
  onDragEnd?: () => void;
  className?: string;
}

export function useDragSort<T extends { id: number }>() {
  const [isSortMode, setIsSortMode] = useState(false);
  const [draftItems, setDraftItems] = useState<T[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const enterSortMode = useCallback((items: T[]) => {
    setDraftItems([...items]);
    setIsSortMode(true);
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const exitSortMode = useCallback(() => {
    setIsSortMode(false);
    setDraftItems([]);
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const getRowProps = useCallback(
    (index: number): DragSortRowProps => {
      if (!isSortMode) {
        return { draggable: false };
      }

      const isDragging = dragIndex === index;
      const isOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
      const dropIndicator = isOver
        ? dragIndex > index
          ? ' bg-primary/10 border-t-2 border-t-primary'
          : ' bg-primary/10 border-b-2 border-b-primary'
        : '';

      return {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
          setDragIndex(index);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        },
        onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverIndex !== index) {
            setDragOverIndex(index);
          }
        },
        onDrop: (e: DragEvent<HTMLTableRowElement>) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData('text/plain');
          const parsed = raw !== '' ? Number(raw) : NaN;
          const fromIndex = dragIndex ?? (Number.isInteger(parsed) ? parsed : null);
          if (
            fromIndex !== null &&
            fromIndex >= 0 &&
            fromIndex !== index
          ) {
            setDraftItems((prev) => {
              if (fromIndex >= prev.length || index < 0 || index >= prev.length) {
                return prev;
              }
              const next = [...prev];
              const [moved] = next.splice(fromIndex, 1);
              next.splice(index, 0, moved);
              return next;
            });
          }
          setDragIndex(null);
          setDragOverIndex(null);
        },
        onDragEnd: () => {
          setDragIndex(null);
          setDragOverIndex(null);
        },
        className: `cursor-move select-none transition-colors${isDragging ? ' opacity-50' : ''}${dropIndicator}`,
      };
    },
    [dragIndex, dragOverIndex, isSortMode],
  );

  return {
    isSortMode,
    draftItems,
    enterSortMode,
    exitSortMode,
    getRowProps,
  };
}
