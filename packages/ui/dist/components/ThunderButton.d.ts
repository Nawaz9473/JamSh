import React from 'react';
interface ThunderButtonProps {
    isThundered: boolean;
    thunderCount: number;
    onPress: () => void;
    size?: number;
}
export declare const ThunderButton: React.FC<ThunderButtonProps>;
export {};
