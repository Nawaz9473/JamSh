export declare const theme: {
    colors: {
        primary: string;
        primaryHover: string;
        primaryGlow: string;
        background: string;
        surface: string;
        surfaceLight: string;
        border: string;
        borderFocused: string;
        text: string;
        textSecondary: string;
        textMuted: string;
        error: string;
        success: string;
        info: string;
        black: string;
        white: string;
        transparent: string;
    };
    spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        xxl: number;
    };
    borderRadius: {
        sm: number;
        md: number;
        lg: number;
        xl: number;
        round: number;
    };
    typography: {
        fontFamily: string;
        sizes: {
            xs: number;
            sm: number;
            md: number;
            lg: number;
            xl: number;
            xxl: number;
            huge: number;
        };
        weights: {
            regular: "400";
            medium: "500";
            semibold: "600";
            bold: "700";
        };
    };
    shadows: {
        sm: {
            shadowColor: string;
            shadowOffset: {
                width: number;
                height: number;
            };
            shadowOpacity: number;
            shadowRadius: number;
            elevation: number;
        };
        md: {
            shadowColor: string;
            shadowOffset: {
                width: number;
                height: number;
            };
            shadowOpacity: number;
            shadowRadius: number;
            elevation: number;
        };
        lg: {
            shadowColor: string;
            shadowOffset: {
                width: number;
                height: number;
            };
            shadowOpacity: number;
            shadowRadius: number;
            elevation: number;
        };
    };
};
export type Theme = typeof theme;
export default theme;
