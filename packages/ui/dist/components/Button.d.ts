import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';
interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'text';
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
}
export declare const Button: React.FC<ButtonProps>;
export {};
