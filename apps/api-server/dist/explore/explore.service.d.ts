import { PrismaService } from '../prisma.service';
export declare class ExploreService {
    private prismaService;
    constructor(prismaService: PrismaService);
    private get prisma();
    fetchExploreFeed(userId: string, category?: string, page?: number, limit?: number): Promise<any[]>;
    fetchTrendingContent(): Promise<{
        hashtags: string[];
        searches: string[];
        creators: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            username: string;
            displayName: string | null;
            avatarUrl: string | null;
            coverUrl: string | null;
            bio: string | null;
            website: string | null;
            followersCount: number;
            followingCount: number;
            isPrivate: boolean;
            isVerified: boolean;
            birthday: Date | null;
        }[];
    }>;
    fetchSearchSuggestions(query: string): Promise<{
        type: string;
        text: string;
    }[]>;
    searchAll(query: string): Promise<{
        users: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            username: string;
            displayName: string | null;
            avatarUrl: string | null;
            coverUrl: string | null;
            bio: string | null;
            website: string | null;
            followersCount: number;
            followingCount: number;
            isPrivate: boolean;
            isVerified: boolean;
            birthday: Date | null;
        }[];
        communities: {
            id: string;
            createdAt: Date;
            name: string;
            avatarUrl: string | null;
            description: string | null;
            bannerUrl: string | null;
            creatorId: string;
        }[];
        posts: ({
            user: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                username: string;
                displayName: string | null;
                avatarUrl: string | null;
                coverUrl: string | null;
                bio: string | null;
                website: string | null;
                followersCount: number;
                followingCount: number;
                isPrivate: boolean;
                isVerified: boolean;
                birthday: Date | null;
            };
            media: {
                id: string;
                createdAt: Date;
                postId: string;
                mediaUrl: string;
                mediaType: string;
                position: number;
            }[];
        } & {
            type: string;
            id: string;
            userId: string;
            createdAt: Date;
            status: string;
            content: string | null;
            thundersCount: number;
            commentsCount: number;
            updatedAt: Date;
            sharesCount: number;
            savesCount: number;
            viewsCount: number;
            watchTimeTotal: number;
            engagementScore: number;
            trendingScore: number;
        })[];
        reels: ({
            user: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                username: string;
                displayName: string | null;
                avatarUrl: string | null;
                coverUrl: string | null;
                bio: string | null;
                website: string | null;
                followersCount: number;
                followingCount: number;
                isPrivate: boolean;
                isVerified: boolean;
                birthday: Date | null;
            };
            media: {
                id: string;
                createdAt: Date;
                postId: string;
                mediaUrl: string;
                mediaType: string;
                position: number;
            }[];
        } & {
            type: string;
            id: string;
            userId: string;
            createdAt: Date;
            status: string;
            content: string | null;
            thundersCount: number;
            commentsCount: number;
            updatedAt: Date;
            sharesCount: number;
            savesCount: number;
            viewsCount: number;
            watchTimeTotal: number;
            engagementScore: number;
            trendingScore: number;
        })[];
    }>;
    logSearchQuery(userId: string, query: string): Promise<void>;
}
