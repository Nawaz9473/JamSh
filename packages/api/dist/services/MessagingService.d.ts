import { ChatRoom, Message } from '@jamsh/types';
export interface PendingOfflineMessage {
    tempId: string;
    roomId: string;
    recipientId: string;
    content: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'document';
    createdAt: string;
}
export declare class MessagingService {
    private static offlineQueue;
    private static processedMessageIds;
    /**
     * Prevents rendering duplicate messages caused by Supabase Realtime socket reconnects
     */
    static isDuplicateMessage(messageId: string): boolean;
    /**
     * Sorts conversations strictly by lastMessageAt DESC (Instagram behavior)
     */
    static sortConversations(conversations: ChatRoom[]): ChatRoom[];
    /**
     * Adds an unsent message to the offline retry queue
     */
    static enqueueOfflineMessage(msg: PendingOfflineMessage): void;
    /**
     * Gets pending offline retry messages
     */
    static getOfflineQueue(): PendingOfflineMessage[];
    /**
     * Removes a message from the offline retry queue after successful send
     */
    static dequeueOfflineMessage(tempId: string): void;
    /**
     * Formats relative timestamps like Instagram (now, 2m, 4h, 1d, 3w)
     */
    static formatTimeAgo(dateString: string): string;
    /**
     * Maps message status for visual UI rendering (○ Sending, ✓ Sent, ✓✓ Delivered, Seen)
     */
    static resolveMessageStatus(msg: Message, currentUserId: string): 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
}
