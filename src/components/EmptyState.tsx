import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export function EmptyState({
  title = '還沒有庫存',
  description = '新增第一項食品後，這裡會依有效期限自動整理。',
  showAction = true,
}: {
  title?: string;
  description?: string;
  showAction?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent sx={{ py: 5 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Box
            sx={{
              width: 58,
              height: 58,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '20px',
              color: 'primary.main',
              bgcolor: 'secondary.light',
            }}
          >
            <Inventory2OutlinedIcon fontSize="large" />
          </Box>
          <Typography variant="h3">{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
            {description}
          </Typography>
          {showAction && (
            <Button variant="contained" onClick={() => navigate('/add')} sx={{ mt: 1 }}>
              新增商品
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
