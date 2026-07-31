import { PrismaService } from '../prisma.service';
export declare class FeedService {
    private prisma;
    constructor(prisma: PrismaService);
    fetchFeed(userId: string, page?: number, limit?: number): Promise<any[]>;
    createPost(userId: string, content: string, type: string, mediaUrls: string[]): Promise<any>;
    toggleThunder(userId: string, postId: string, commentId?: string): Promise<{
        thundered: boolean;
        countChange: number;
    }>;
    addComment(userId: string, postId: string, content: string, parentId?: string): Promise<any>;
    editComment(userId: string, commentId: string, content: string): Promise<any>;
    deleteComment(userId: string, commentId: string): Promise<any>;
    fetchComments(postId: string, sortBy?: string, page?: number, limit?: number): Promise<any[]>;
    toggleSave(userId: string, postId: string): Promise<any>;
    shareContent(userId: string, postId: string, targetType?: string, targetId?: string): Promise<any>;
    logPostView(userId: string | null, postId: string, watchTime?: number): Promise<any>;
    fetchNotifications(userId: string): Promise<any[]>;
    private moderateContent;
    private checkBlockStatus;
    private createNotification;
    recalculatePostEngagement(postId: string): Promise<void>;
    createStory(userId: string, mediaUrl: string, mediaType: string): Promise<any>;
    fetchStories(): Promise<any[]>;
    fileReport(userId: string, reportedUserId?: string, postId?: string, commentId?: string, reason?: string): Promise<any>;
}
