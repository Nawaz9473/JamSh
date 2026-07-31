import { jsx as _jsx } from "react/jsx-runtime";
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, } from 'react-native';
import theme from '../theme';
export const Button = ({ title, onPress, variant = 'primary', loading = false, disabled = false, style, textStyle, }) => {
    const isPrimary = variant === 'primary';
    const isOutline = variant === 'outline';
    const isText = variant === 'text';
    const containerStyles = [
        styles.base,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        isOutline && styles.outline,
        isText && styles.text,
        disabled && styles.disabled,
        style,
    ];
    const titleStyles = [
        styles.baseText,
        isPrimary && styles.primaryText,
        variant === 'secondary' && styles.secondaryText,
        isOutline && styles.outlineText,
        isText && styles.textText,
        disabled && styles.disabledText,
        textStyle,
    ];
    return (_jsx(TouchableOpacity, { activeOpacity: 0.8, onPress: onPress, disabled: disabled || loading, style: containerStyles, children: loading ? (_jsx(ActivityIndicator, { size: "small", color: isOutline || isText ? theme.colors.primary : theme.colors.white })) : (_jsx(Text, { style: titleStyles, children: title })) }));
};
const styles = StyleSheet.create({
    base: {
        height: 48,
        borderRadius: theme.borderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        flexDirection: 'row',
    },
    primary: {
        backgroundColor: theme.colors.primary,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    secondary: {
        backgroundColor: theme.colors.surfaceLight,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    outline: {
        backgroundColor: theme.colors.transparent,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
    },
    text: {
        backgroundColor: theme.colors.transparent,
        height: 'auto',
        paddingHorizontal: 0,
    },
    disabled: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        shadowOpacity: 0,
        elevation: 0,
        opacity: 0.5,
    },
    baseText: {
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.semibold,
        fontFamily: theme.typography.fontFamily,
    },
    primaryText: {
        color: theme.colors.black, // Dark text on bright orange button looks very modern
    },
    secondaryText: {
        color: theme.colors.text,
    },
    outlineText: {
        color: theme.colors.primary,
    },
    textText: {
        color: theme.colors.primary,
    },
    disabledText: {
        color: theme.colors.textMuted,
    },
});
