export const theme = {
    colors: {
        primary: '#F59A18', // JAMSH Orange (Thunder, Power, Community)
        primaryHover: '#D98510',
        primaryGlow: 'rgba(245, 154, 24, 0.15)',
        background: '#121212', // Black background
        surface: '#1A1A1A', // Dark gray card background
        surfaceLight: '#242424', // Lighter surface
        border: '#2A2A2A', // Border color
        borderFocused: '#F59A18',
        text: '#FFFFFF', // High emphasis text
        textSecondary: '#A0A0A0', // Medium emphasis text
        textMuted: '#666666', // Low emphasis text
        error: '#FF3B30', // Error red
        success: '#34C759', // Success green
        info: '#0A84FF', // Info blue
        black: '#000000',
        white: '#FFFFFF',
        transparent: 'transparent',
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        round: 9999,
    },
    typography: {
        fontFamily: 'System',
        sizes: {
            xs: 12,
            sm: 14,
            md: 16,
            lg: 18,
            xl: 20,
            xxl: 28,
            huge: 36,
        },
        weights: {
            regular: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
        },
    },
    shadows: {
        sm: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.18,
            shadowRadius: 1.0,
            elevation: 1,
        },
        md: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
        },
        lg: {
            shadowColor: '#F59A18',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 10,
        },
    },
};
export default theme;
