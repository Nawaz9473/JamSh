export class MessagingService {
    static offlineQueue = [];
    static processedMessageIds = new Set();
    /**
     * Prevents rendering duplicate messages caused by Supabase Realtime socket reconnects
     */
    static isDuplicateMessage(messageId) {
        if (!messageId)
            return false;
        if (this.processedMessageIds.has(messageId)) {
            return true;
        }
        this.processedMessageIds.add(messageId);
        // Limit memory footprint of set
        if (this.processedMessageIds.size > 10000) {
            const iterator = this.processedMessageIds.values();
            for (let i = 0; i < 2000; i++) {
                const val = iterator.next().value;
                if (val)
                    this.processedMessageIds.delete(val);
            }
        }
        return false;
    }
    /**
     * Sorts conversations strictly by lastMessageAt DESC (Instagram behavior)
     */
    static sortConversations(conversations) {
        return [...conversations].sort((a, b) => {
            const timeA = new Date(a.last_message_at || a.created_at).getTime();
            const timeB = new Date(b.last_message_at || b.created_at).getTime();
            return timeB - timeA;
        });
    }
    /**
     * Adds an unsent message to the offline retry queue
     */
    static enqueueOfflineMessage(msg) {
        this.offlineQueue.push(msg);
    }
    /**
     * Gets pending offline retry messages
     */
    static getOfflineQueue() {
        return [...this.offlineQueue];
    }
    /**
     * Removes a message from the offline retry queue after successful send
     */
    static dequeueOfflineMessage(tempId) {
        this.offlineQueue = this.offlineQueue.filter(item => item.tempId !== tempId);
    }
    /**
     * Formats relative timestamps like Instagram (now, 2m, 4h, 1d, 3w)
     */
    static formatTimeAgo(dateString) {
        if (!dateString)
            return 'now';
        const now = new Date();
        const date = new Date(dateString);
        const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (diffSeconds < 60)
            return 'now';
        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60)
            return `${diffMinutes}m`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24)
            return `${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7)
            return `${diffDays}d`;
        const diffWeeks = Math.floor(diffDays / 7);
        return `${diffWeeks}w`;
    }
    /**
     * Maps message status for visual UI rendering (○ Sending, ✓ Sent, ✓✓ Delivered, Seen)
     */
    static resolveMessageStatus(msg, currentUserId) {
        if (msg.status === 'sending' || msg.status === 'failed') {
            return msg.status;
        }
        if (msg.sender_id !== currentUserId) {
            return 'delivered'; // Status badges are shown on sent messages
        }
        if (msg.seen_at) {
            return 'seen';
        }
        if (msg.delivered_at) {
            return 'delivered';
        }
        return 'sent';
    }
}
