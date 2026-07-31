import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { StyleSheet, TextInput, View, Text, } from 'react-native';
import theme from '../theme';
export const Input = ({ label, error, style, containerStyle, onFocus, onBlur, ...props }) => {
    const [isFocused, setIsFocused] = useState(false);
    return (_jsxs(View, { style: [styles.container, containerStyle], children: [label && _jsx(Text, { style: styles.label, children: label }), _jsx(View, { style: [
                    styles.inputContainer,
                    isFocused && styles.inputFocused,
                    error ? styles.inputError : null,
                ], children: _jsx(TextInput, { placeholderTextColor: theme.colors.textMuted, style: [styles.input, style], onFocus: (e) => {
                        setIsFocused(true);
                        onFocus?.(e);
                    }, onBlur: (e) => {
                        setIsFocused(false);
                        onBlur?.(e);
                    }, ...props }) }), error && _jsx(Text, { style: styles.errorText, children: error })] }));
};
const styles = StyleSheet.create({
    container: {
        marginBottom: theme.spacing.md,
        width: '100%',
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: theme.typography.sizes.sm,
        fontWeight: theme.typography.weights.medium,
        marginBottom: theme.spacing.xs,
        fontFamily: theme.typography.fontFamily,
    },
    inputContainer: {
        height: 48,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: theme.spacing.md,
        justifyContent: 'center',
    },
    inputFocused: {
        borderColor: theme.colors.primary,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 2,
    },
    inputError: {
        borderColor: theme.colors.error,
    },
    input: {
        color: theme.colors.text,
        fontSize: theme.typography.sizes.md,
        fontFamily: theme.typography.fontFamily,
        height: '100%',
        width: '100%',
    },
    errorText: {
        color: theme.colors.error,
        fontSize: theme.typography.sizes.xs,
        marginTop: theme.spacing.xs,
        fontFamily: theme.typography.fontFamily,
    },
});
