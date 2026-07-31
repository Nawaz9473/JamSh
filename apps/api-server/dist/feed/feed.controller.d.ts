import { FeedService } from './feed.service';
export declare class FeedController {
    private feedService;
    constructor(feedService: FeedService);
    getFeed(user: any, page: string, limit: string): Promise<any[]>;
    createPost(user: any, body: any): Promise<any>;
    toggleThunder(user: any, body: any): Promise<{
        thundered: boolean;
        countChange: number;
    }>;
    addComment(user: any, body: any): Promise<any>;
    editComment(user: any, body: any): Promise<any>;
    deleteComment(user: any, commentId: string): Promise<any>;
    getComments(postId: string, sortBy: string, page: string, limit: string): Promise<any[]>;
    toggleSave(user: any, body: any): Promise<any>;
    shareContent(user: any, body: any): Promise<any>;
    logPostView(user: any, body: any): Promise<any>;
    getNotifications(user: any): Promise<any[]>;
    createStory(user: any, body: any): Promise<any>;
    getStories(): Promise<any[]>;
    fileReport(user: any, body: any): Promise<any>;
}
