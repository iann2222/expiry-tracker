import type { PaletteMode } from '@mui/material';
import { createTheme } from '@mui/material/styles';

export function createAppTheme(mode: PaletteMode) {
  const dark = mode === 'dark';
  const background = dark ? '#101816' : '#F8FAF7';
  const paper = dark ? '#18231F' : '#FFFFFF';
  const divider = dark ? '#2A3934' : '#E6ECE7';

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: {
        main: dark ? '#87C7B3' : '#1F6657',
        light: dark ? '#B6DECF' : '#82A995',
        dark: dark ? '#4C947F' : '#184C42',
        contrastText: dark ? '#10211C' : '#FFFFFF',
      },
      secondary: {
        main: dark ? '#A9C49A' : '#8DA47E',
        light: dark ? '#334A3D' : '#DCE7D6',
        dark: dark ? '#738B67' : '#5F7654',
      },
      background: { default: background, paper },
      text: {
        primary: dark ? '#EFF6F2' : '#20302C',
        secondary: dark ? '#A8B9B3' : '#66736F',
      },
      divider,
    },
    shape: { borderRadius: 18 },
    typography: {
      fontFamily:
        '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      h1: { fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.25 },
      h2: { fontSize: '1.25rem', fontWeight: 750, lineHeight: 1.35 },
      h3: { fontSize: '1.05rem', fontWeight: 750, lineHeight: 1.4 },
      button: { fontWeight: 700, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { colorScheme: mode },
          body: {
            minWidth: 320,
            minHeight: '100vh',
            backgroundColor: background,
            backgroundImage: dark
              ? 'radial-gradient(circle at 12% 0%, rgba(135, 199, 179, 0.10), transparent 26rem)'
              : 'radial-gradient(circle at 12% 0%, rgba(130, 169, 149, 0.13), transparent 26rem)',
          },
          '*': { boxSizing: 'border-box' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${divider}`,
            backgroundImage: 'none',
            boxShadow: dark
              ? '0 12px 32px rgba(0, 0, 0, 0.22)'
              : '0 10px 30px rgba(31, 76, 66, 0.055)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 44, borderRadius: 14, paddingInline: 18 },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 14, backgroundColor: dark ? '#1B2824' : '#FFFFFF' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 10, fontWeight: 700 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { backgroundImage: 'none', border: `1px solid ${divider}` },
        },
      },
    },
  });
}
