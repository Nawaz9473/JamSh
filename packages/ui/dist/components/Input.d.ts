import React from 'react';
import { TextInputProps, ViewStyle } from 'react-native';
interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: ViewStyle;
}
export declare const Input: React.FC<InputProps>;
export {};
