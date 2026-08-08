import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { MapPin, Search, X } from 'lucide-react-native';
import { theme } from '@jamsh/ui';

interface LocationPickerProps {
  visible: boolean;
  selectedLocation: string | null;
  onSelect: (loc: string | null) => void;
  onClose: () => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  visible,
  selectedLocation,
  onSelect,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const suggestedLocations = [
    'Neo-Tokyo Cyber Hub',
    'San Francisco Tech Core',
    'London Cyber District',
    'Berlin Underground',
    'Singapore Metropolis',
    'Tokyo Night Street',
  ];

  const filtered = suggestedLocations.filter((loc) =>
    loc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Location</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Search size={18} color="#AAA" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search location..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <MapPin size={18} color={theme.colors.primary} />
              <Text style={styles.locationText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 48,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    margin: 16,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
    gap: 12,
  },
  locationText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
