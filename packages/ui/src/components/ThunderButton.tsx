import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import theme from '../theme';

interface ThunderButtonProps {
  isThundered: boolean;
  thunderCount: number;
  onPress: () => void;
  size?: number;
}

export const ThunderButton: React.FC<ThunderButtonProps> = ({
  isThundered,
  thunderCount,
  onPress,
  size = 24,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [particles, setParticles] = useState<{ id: number; x: Animated.Value; y: Animated.Value; scale: Animated.Value; opacity: Animated.Value }[]>([]);
  const particleId = useRef(0);

  const triggerSparkParticles = () => {
    const newParticles = Array.from({ length: 6 }).map((_, index) => {
      const angle = (index * 60 * Math.PI) / 180;
      const distance = 25 + Math.random() * 15;
      
      const p = {
        id: particleId.current++,
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        scale: new Animated.Value(0.2),
        opacity: new Animated.Value(1),
      };

      Animated.parallel([
        Animated.timing(p.x, {
          toValue: Math.cos(angle) * distance,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(p.y, {
          toValue: Math.sin(angle) * distance,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(p.scale, {
          toValue: 1.2,
          duration: 350,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(() => {
        setParticles((prev) => prev.filter((item) => item.id !== p.id));
      });

      return p;
    });

    setParticles((prev) => [...prev, ...newParticles]);
  };

  const handlePress = () => {
    // Run animations
    scaleAnim.setValue(0.7);
    rotateAnim.setValue(-0.3); // Rotate slightly left

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(rotateAnim, {
        toValue: 0,
        friction: 3,
        tension: 80,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    if (!isThundered) {
      triggerSparkParticles();
    }

    onPress();
  };

  // Convert rotation value to degrees
  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-45deg', '45deg'],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={styles.container}
    >
      <View style={styles.iconContainer}>
        {/* Render animated particles */}
        {particles.map((p) => (
          <Animated.View
            key={p.id}
            style={[
              styles.particle,
              {
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
              },
            ]}
          />
        ))}

        <Animated.View
          style={[
            styles.thunderIconWrapper,
            {
              transform: [{ scale: scaleAnim }, { rotate: rotateInterpolation }],
            },
          ]}
        >
          {/* Custom vector-like lightning shape drawn via CSS borders for universal compatibility */}
          <View style={[styles.boltContainer, { width: size, height: size * 1.5 }]}>
            {/* The SVG Lightning Bolt path representation.
                Since react-native-svg might not be installed, we use a custom styled shape.
                If isThundered, it glows and displays orange.
             */}
            <Text
              style={[
                styles.boltText,
                {
                  fontSize: size,
                  color: isThundered ? theme.colors.primary : theme.colors.textSecondary,
                  textShadowColor: isThundered ? 'rgba(245, 154, 24, 0.75)' : 'transparent',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: isThundered ? 10 : 0,
                },
              ]}
            >
              ⚡
            </Text>
          </View>
        </Animated.View>
      </View>

      <Text
        style={[
          styles.countText,
          {
            color: isThundered ? theme.colors.primary : theme.colors.textSecondary,
            fontWeight: isThundered ? theme.typography.weights.bold : theme.typography.weights.medium,
          },
        ]}
      >
        {thunderCount} {thunderCount === 1 ? 'Thunder' : 'Thunders'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  thunderIconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  boltContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  boltText: {
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? undefined : 28,
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  countText: {
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.fontFamily,
  },
});
