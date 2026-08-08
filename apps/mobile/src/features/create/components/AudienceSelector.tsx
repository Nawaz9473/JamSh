import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Globe, Users, Lock, Check } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { AudienceVisibility } from '../types';

interface AudienceSelectorProps {
  visible: boolean;
  selected: AudienceVisibility;
  onSelect: (audience: AudienceVisibility) => void;
  onClose: () => void;
}

export const AudienceSelector: React.FC<AudienceSelectorProps> = ({
  visible,
  selected,
  onSelect,
  onClose,
}) => {
  const options: { id: AudienceVisibility; label: string; desc: string; icon: any }[] = [
    { id: 'public', label: 'Public', desc: 'Anyone on JAMSH can view and share', icon: Globe },
    { id: 'friends', label: 'Friends Only', desc: 'Only your mutual followers can view', icon: Users },
    { id: 'private', label: 'Private (Only Me)', desc: 'Visible only to you', icon: Lock },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Audience Visibility</Text>
          <Text style={styles.subtitle}>Who can see this content?</Text>

          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.optionCard, isSelected && styles.optionCardActive]}
                onPress={() => {
                  onSelect(opt.id);
                  onClose();
                }}
              >
                <View style={styles.iconContainer}>
                  <Icon size={22} color={isSelected ? theme.colors.primary : '#AAA'} />
                </View>

                <View style={styles.textContainer}>
                  <Text style={[styles.label, isSelected && styles.labelActive]}>{opt.label}</Text>
                  <Text style={styles.desc}>{opt.desc}</Text>
                </View>

                {isSelected && (
                  <View style={styles.checkCircle}>
                    <Check size={16} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.3)',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#AAA',
    fontSize: 13,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  optionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(245, 154, 24, 0.12)',
  },
  iconContainer: {
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  labelActive: {
    color: theme.colors.primary,
  },
  desc: {
    color: '#888',
    fontSize: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
