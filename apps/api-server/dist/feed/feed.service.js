"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let FeedService = class FeedService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async fetchFeed(userId, page = 0, limit = 10) {
        const follows = await this.prisma.client.followRelation.findMany({
            where: { followerId: userId, status: 'accepted' },
            select: { followingId: true }
        });
        const followedIds = follows.map(f => f.followingId);
        const queryFilter = { status: 'published' };
        if (followedIds.length > 0) {
            queryFilter['userId'] = { in: [userId, ...followedIds] };
        }
        const posts = await this.prisma.client.post.findMany({
            where: queryFilter,
            include: {
                user: true,
                media: true,
                comments: {
                    include: { user: true },
                    take: 5,
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: page * limit,
            take: limit,
        });
        const postIds = posts.map(p => p.id);
        const reactions = await this.prisma.client.thunderReaction.findMany({
            where: { userId, postId: { in: postIds }, commentId: null },
            select: { postId: true }
        });
        const reactedIds = new Set(reactions.map(r => r.postId));
        return posts.map(post => ({
            ...post,
            thundered_by_me: reactedIds.has(post.id),
        }));
    }
    async createPost(userId, content, type, mediaUrls) {
        const post = await this.prisma.client.post.create({
            data: {
                userId,
                content,
                type,
                status: 'published',
            },
            include: { user: true, media: true }
        });
        if (mediaUrls.length > 0) {
            const mediaInserts = mediaUrls.map((url, index) => ({
                postId: post.id,
                mediaUrl: url,
                mediaType: type === 'video' ? 'video' : 'image',
                position: index,
            }));
            await this.prisma.client.postMedia.createMany({
                data: mediaInserts
            });
        }
        return await this.prisma.client.post.findUnique({
            where: { id: post.id },
            include: { user: true, media: true }
        });
    }
    async toggleThunder(userId, postId, commentId) {
        const queryFilter = { userId };
        if (commentId) {
            queryFilter['commentId'] = commentId;
        }
        else {
            queryFilter['postId'] = postId;
            queryFilter['commentId'] = null;
        }
        const existing = await this.prisma.client.thunderReaction.findFirst({
            where: queryFilter
        });
        if (existing) {
            await this.prisma.client.thunderReaction.delete({
                where: { id: existing.id }
            });
            const countChange = -1;
            if (commentId) {
                await this.prisma.client.comment.update({
                    where: { id: commentId },
                    data: { thundersCount: { decrement: 1 } }
                });
            }
            else {
                await this.prisma.client.post.update({
                    where: { id: postId },
                    data: { thundersCount: { decrement: 1 } }
                });
            }
            return { thundered: false, countChange };
        }
        else {
            await this.prisma.client.thunderReaction.create({
                data: {
                    userId,
                    postId: commentId ? null : postId,
                    commentId: commentId || null,
                }
            });
            const countChange = 1;
            if (commentId) {
                await this.prisma.client.comment.update({
                    where: { id: commentId },
                    data: { thundersCount: { increment: 1 } }
                });
            }
            else {
                await this.prisma.client.post.update({
                    where: { id: postId },
                    data: { thundersCount: { increment: 1 } }
                });
            }
            return { thundered: true, countChange };
        }
    }
    async addComment(userId, postId, content, parentId) {
        const post = await this.prisma.client.post.findUnique({ where: { id: postId } });
        if (!post)
            throw new common_1.NotFoundException('Post not found');
        await this.checkBlockStatus(userId, post.userId);
        const lastComment = await this.prisma.client.comment.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        if (lastComment && (Date.now() - new Date(lastComment.createdAt).getTime()) < 3000) {
            throw new common_1.BadRequestException('Please wait 3 seconds before posting another comment');
        }
        const cleanContent = this.moderateContent(content);
        const comment = await this.prisma.client.comment.create({
            data: {
                userId,
                postId,
                content: cleanContent,
                parentId: parentId || null,
            },
            include: { user: true }
        });
        await this.prisma.client.post.update({
            where: { id: postId },
            data: { commentsCount: { increment: 1 } }
        });
        await this.recalculatePostEngagement(postId);
        if (post.userId !== userId) {
            await this.createNotification(post.userId, userId, 'comment', postId, comment.id);
        }
        if (parentId) {
            const parentComment = await this.prisma.client.comment.findUnique({ where: { id: parentId } });
            if (parentComment && parentComment.userId !== userId) {
                await this.createNotification(parentComment.userId, userId, 'reply', postId, comment.id);
            }
        }
        const mentions = content.match(/@[a-zA-Z0-9_]+/g) || [];
        for (const mention of mentions) {
            const username = mention.slice(1);
            const mentionedUser = await this.prisma.client.userProfile.findUnique({ where: { username } });
            if (mentionedUser && mentionedUser.id !== userId) {
                await this.createNotification(mentionedUser.id, userId, 'mention', postId, comment.id);
            }
        }
        return comment;
    }
    async editComment(userId, commentId, content) {
        const comment = await this.prisma.client.comment.findUnique({
            where: { id: commentId }
        });
        if (!comment)
            throw new common_1.NotFoundException('Comment not found');
        if (comment.userId !== userId)
            throw new common_1.ForbiddenException('Cannot edit other user comments');
        if (content.toLowerCase().trim() === comment.content.toLowerCase().trim()) {
            throw new common_1.BadRequestException('Duplicate comment content detected');
        }
        const cleanContent = this.moderateContent(content);
        return await this.prisma.client.comment.update({
            where: { id: commentId },
            data: { content: cleanContent },
            include: { user: true }
        });
    }
    async deleteComment(userId, commentId) {
        const comment = await this.prisma.client.comment.findUnique({
            where: { id: commentId }
        });
        if (!comment)
            throw new common_1.NotFoundException('Comment not found');
        if (comment.userId !== userId)
            throw new common_1.ForbiddenException('Cannot delete other user comments');
        await this.prisma.client.comment.delete({
            where: { id: commentId }
        });
        await this.prisma.client.post.update({
            where: { id: comment.postId },
            data: { commentsCount: { decrement: 1 } }
        });
        await this.recalculatePostEngagement(comment.postId);
        return { success: true };
    }
    async fetchComments(postId, sortBy = 'newest', page = 0, limit = 10) {
        const skip = page * limit;
        let orderBy = { createdAt: 'desc' };
        if (sortBy === 'oldest') {
            orderBy = { createdAt: 'asc' };
        }
        else if (sortBy === 'top') {
            orderBy = [
                { thundersCount: 'desc' },
                { createdAt: 'desc' }
            ];
        }
        return await this.prisma.client.comment.findMany({
            where: { postId, parentId: null },
            orderBy,
            skip,
            take: limit,
            include: {
                user: true,
                replies: {
                    include: { user: true }
                }
            }
        });
    }
    async toggleSave(userId, postId) {
        const existing = await this.prisma.client.save.findUnique({
            where: { userId_postId: { userId, postId } }
        });
        if (existing) {
            await this.prisma.client.save.delete({
                where: { id: existing.id }
            });
            await this.prisma.client.post.update({
                where: { id: postId },
                data: { savesCount: { decrement: 1 } }
            });
            await this.recalculatePostEngagement(postId);
            return { saved: false };
        }
        else {
            await this.prisma.client.save.create({
                data: { userId, postId }
            });
            await this.prisma.client.post.update({
                where: { id: postId },
                data: { savesCount: { increment: 1 } }
            });
            await this.recalculatePostEngagement(postId);
            const post = await this.prisma.client.post.findUnique({ where: { id: postId } });
            if (post && post.userId !== userId) {
                await this.createNotification(post.userId, userId, 'save', postId);
            }
            return { saved: true };
        }
    }
    async shareContent(userId, postId, targetType = 'external', targetId) {
        const share = await this.prisma.client.share.create({
            data: { userId, postId, targetType, targetId }
        });
        await this.prisma.client.post.update({
            where: { id: postId },
            data: { sharesCount: { increment: 1 } }
        });
        await this.recalculatePostEngagement(postId);
        const post = await this.prisma.client.post.findUnique({ where: { id: postId } });
        if (post && post.userId !== userId) {
            await this.createNotification(post.userId, userId, 'share', postId);
        }
        return share;
    }
    async logPostView(userId, postId, watchTime = 0.0) {
        const postView = await this.prisma.client.postView.create({
            data: { userId, postId, watchTime }
        });
        await this.prisma.client.post.update({
            where: { id: postId },
            data: {
                viewsCount: { increment: 1 },
                watchTimeTotal: { increment: watchTime }
            }
        });
        await this.recalculatePostEngagement(postId);
        return postView;
    }
    async fetchNotifications(userId) {
        return await this.prisma.client.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { sender: true }
        });
    }
    moderateContent(text) {
        const badWords = ['spam', 'abuse', 'kill', 'hate', 'fudge', 'profanity'];
        let clean = text;
        badWords.forEach(w => {
            const regex = new RegExp(`\\b${w}\\b`, 'gi');
            clean = clean.replace(regex, '***');
        });
        return clean;
    }
    async checkBlockStatus(userA, userB) {
        const blocked = await this.prisma.client.userBlock.findFirst({
            where: {
                OR: [
                    { blockerId: userA, blockedId: userB },
                    { blockerId: userB, blockedId: userA }
                ]
            }
        });
        if (blocked) {
            throw new common_1.ForbiddenException('Interaction blocked between these accounts.');
        }
    }
    async createNotification(userId, senderId, type, postId, commentId) {
        return await this.prisma.client.notification.create({
            data: { userId, senderId, type, postId, commentId }
        });
    }
    async recalculatePostEngagement(postId) {
        const post = await this.prisma.client.post.findUnique({
            where: { id: postId }
        });
        if (!post)
            return;
        const engagementScore = (post.watchTimeTotal * 2.0) +
            (post.savesCount * 15.0) +
            (post.sharesCount * 15.0) +
            (post.thundersCount * 5.0) +
            (post.commentsCount * 10.0);
        const hours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
        const trendingScore = (engagementScore + 1.0) / Math.pow(hours + 2.0, 1.8);
        await this.prisma.client.post.update({
            where: { id: postId },
            data: { engagementScore, trendingScore }
        });
    }
    async createStory(userId, mediaUrl, mediaType) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return await this.prisma.client.story.create({
            data: {
                userId,
                mediaUrl,
                mediaType,
                expiresAt,
            }
        });
    }
    async fetchStories() {
        return await this.prisma.client.story.findMany({
            where: { expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' }
        });
    }
    async fileReport(userId, reportedUserId, postId, commentId, reason) {
        if (!reportedUserId && !postId && !commentId) {
            throw new common_1.BadRequestException('Report target must be specified.');
        }
        return await this.prisma.client.report.create({
            data: {
                reporterId: userId,
                reportedUserId: reportedUserId || null,
                postId: postId || null,
                commentId: commentId || null,
                reason: reason || 'Inappropriate Content',
            }
        });
    }
};
exports.FeedService = FeedService;
exports.FeedService = FeedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FeedService);
//# sourceMappingURL=feed.service.js.map