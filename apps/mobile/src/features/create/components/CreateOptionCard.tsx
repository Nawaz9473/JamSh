import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { theme } from '@jamsh/ui';

interface CreateOptionCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconBgColor?: string;
  onPress: () => void;
}

export const CreateOptionCard: React.FC<CreateOptionCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconBgColor = 'rgba(245, 154, 24, 0.15)',
  onPress,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.card}
      onPress={onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
        <Icon size={24} color={theme.colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.2)',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#A0A0A0',
    fontSize: 12,
  },
  chevron: {
    paddingLeft: 8,
  },
  chevronText: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: '300',
  },
});
