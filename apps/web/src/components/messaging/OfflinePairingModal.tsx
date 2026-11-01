import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  QrCode,
  Radio,
  Copy,
  Check,
  AlertCircle,
  X,
  ShieldCheck,
  Zap,
  Share2,
} from 'lucide-react';
import {
  useAuthStore,
  generateOfflinePairingUrl,
  parseOfflinePairingUrl,
  completeOfflinePairing,
} from '@jamsh/api';
import { ChatRoom } from '@jamsh/types';

interface OfflinePairingModalProps {
  visible: boolean;
  onClose: () => void;
  onPaired?: (room: ChatRoom) => void;
}

export const OfflinePairingModal: React.FC<OfflinePairingModalProps> = ({
  visible,
  onClose,
  onPaired,
}) => {
  const [activeTab, setActiveTab] = useState<'my_code' | 'scan_peer'>('my_code');
  const [peerUrlInput, setPeerUrlInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<string | null>(null);
  const [myPairingUrl, setMyPairingUrl] = useState('');

  const currentUser = useAuthStore((s) => s.user);
  const deviceKeyPair = useAuthStore((s) => s.deviceKeyPair);

  useEffect(() => {
    if (visible && currentUser && deviceKeyPair) {
      const url = generateOfflinePairingUrl(currentUser, deviceKeyPair.publicKey);
      setMyPairingUrl(url);
    }
  }, [visible, currentUser, deviceKeyPair]);

  const handleCopyCode = async () => {
    if (!myPairingUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(myPairingUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Failed to copy to clipboard', e);
    }
  };

  const handleCompletePairing = () => {
    setPairingError(null);
    setPairingSuccess(null);

    if (!peerUrlInput.trim()) {
      setPairingError('Please paste a valid jamsh-pair:// pairing code.');
      return;
    }

    const parsed = parseOfflinePairingUrl(peerUrlInput.trim());
    if (!parsed) {
      setPairingError('Invalid pairing format. Expected jamsh-pair://v1?id=...&pub=...');
      return;
    }

    if (currentUser && parsed.userId === currentUser.id) {
      setPairingError('You cannot pair with your own device ID.');
      return;
    }

    try {
      const myId = currentUser?.id || 'anonymous';
      const createdRoom = completeOfflinePairing(myId, parsed);
      setPairingSuccess(`Successfully paired with @${parsed.username}! Direct offline E2EE channel established.`);
      setPeerUrlInput('');

      setTimeout(() => {
        if (onPaired) onPaired(createdRoom);
        onClose();
      }, 1500);
    } catch (err: any) {
      setPairingError(err?.message || 'Failed to complete pairing');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Radio size={20} color="#F59A18" />
              <Text style={styles.title}>Offline Mesh Pairing</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Connect and exchange end-to-end encryption keys directly over Bluetooth Low Energy mesh without internet access.
          </Text>

          {/* Tab Selector */}
          <View style={styles.tabs}>
            <TouchableOpacity
              onPress={() => setActiveTab('my_code')}
              style={[styles.tabBtn, activeTab === 'my_code' && styles.tabBtnActive]}
            >
              <QrCode size={16} color={activeTab === 'my_code' ? '#000000' : '#8E8E93'} />
              <Text style={[styles.tabText, activeTab === 'my_code' && styles.tabTextActive]}>
                My Pairing Code
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('scan_peer')}
              style={[styles.tabBtn, activeTab === 'scan_peer' && styles.tabBtnActive]}
            >
              <Zap size={16} color={activeTab === 'scan_peer' ? '#000000' : '#8E8E93'} />
              <Text style={[styles.tabText, activeTab === 'scan_peer' && styles.tabTextActive]}>
                Pair with Peer
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: My Pairing Code */}
          {activeTab === 'my_code' && (
            <View style={styles.contentSection}>
              <View style={styles.qrContainer}>
                <View style={styles.qrGraphic}>
                  <QrCode size={110} color="#F59A18" />
                </View>
                <View style={styles.keyBadge}>
                  <ShieldCheck size={14} color="#F59A18" />
                  <Text style={styles.keyBadgeText}>
                    X25519 Key: {deviceKeyPair ? `${deviceKeyPair.publicKey.substring(0, 12)}...` : 'Generating...'}
                  </Text>
                </View>
              </View>

              <View style={styles.codeBox}>
                <Text style={styles.codeText} numberOfLines={2} ellipsizeMode="middle">
                  {myPairingUrl || 'Loading pairing code...'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCopyCode}
                activeOpacity={0.8}
                style={[styles.actionBtn, copied && styles.actionBtnSuccess]}
              >
                {copied ? <Check size={16} color="#FFFFFF" /> : <Copy size={16} color="#000000" />}
                <Text style={[styles.actionBtnText, copied && styles.actionBtnTextSuccess]}>
                  {copied ? 'Copied to Clipboard!' : 'Copy My Pairing Code'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tab 2: Pair with Peer */}
          {activeTab === 'scan_peer' && (
            <View style={styles.contentSection}>
              <Text style={styles.inputLabel}>Paste Peer's Pairing Code or URL:</Text>
              <TextInput
                style={styles.textInput}
                placeholder="jamsh-pair://v1?id=...&pub=..."
                placeholderTextColor="#636366"
                value={peerUrlInput}
                onChangeText={setPeerUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {pairingError && (
                <View style={styles.errorBox}>
                  <AlertCircle size={14} color="#FF3B30" />
                  <Text style={styles.errorText}>{pairingError}</Text>
                </View>
              )}

              {pairingSuccess && (
                <View style={styles.successBox}>
                  <Check size={14} color="#34C759" />
                  <Text style={styles.successText}>{pairingSuccess}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleCompletePairing}
                activeOpacity={0.8}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <ShieldCheck size={16} color="#000000" />
                <Text style={styles.actionBtnText}>Pair Peer & Establish E2EE</Text>
              </TouchableOpacity>

              <View style={styles.meshInfoBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Share2 size={13} color="#00E5FF" />
                  <Text style={styles.meshInfoTitle}>Automatic BLE Mesh Relay</Text>
                </View>
                <Text style={styles.meshInfoText}>
                  Once paired, offline messages automatically route across intermediate BLE nodes up to 3 hops without internet.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#121212',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#262626',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#F59A18',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  contentSection: {
    alignItems: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  qrGraphic: {
    backgroundColor: '#1C1C1E',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 12,
  },
  keyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 154, 24, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.3)',
  },
  keyBadgeText: {
    color: '#F59A18',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  codeBox: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    padding: 12,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  codeText: {
    color: '#CCCCCC',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  actionBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59A18',
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnPrimary: {
    backgroundColor: '#F59A18',
    marginTop: 8,
  },
  actionBtnSuccess: {
    backgroundColor: '#34C759',
  },
  actionBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnTextSuccess: {
    color: '#FFFFFF',
  },
  inputLabel: {
    alignSelf: 'flex-start',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  errorBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    flex: 1,
  },
  successBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  successText: {
    color: '#34C759',
    fontSize: 12,
    flex: 1,
  },
  meshInfoBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderColor: 'rgba(0, 229, 255, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  meshInfoTitle: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  meshInfoText: {
    color: '#8E8E93',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
});
