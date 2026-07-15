import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import { IconButton, Stack, Typography } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category } from '../types';

export function SortableCategoryRow({
  category,
  onDelete,
}: {
  category: Category;
  onDelete: (category: Category) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        minHeight: 54,
        py: 0.5,
        pl: 0.5,
        alignItems: 'center',
        borderBottom: '1px solid',
        borderColor: 'divider',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        bgcolor: isDragging ? 'action.hover' : 'transparent',
        position: 'relative',
        zIndex: isDragging ? 2 : 1,
      }}
    >
      <Typography sx={{ flex: 1, fontWeight: 650 }}>{category.name}</Typography>
      <IconButton size="small" aria-label={`刪除${category.name}`} onClick={() => onDelete(category)}>
        <DeleteOutlineRoundedIcon />
      </IconButton>
      <IconButton
        size="small"
        aria-label={`拖拉排序${category.name}`}
        sx={{ ml: 0.5, cursor: 'grab', touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        <DragIndicatorRoundedIcon />
      </IconButton>
    </Stack>
  );
}
