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
exports.ExploreService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let ExploreService = class ExploreService {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.client;
    }
    async fetchExploreFeed(userId, category = 'all', page = 0, limit = 10) {
        const skip = page * limit;
        const interests = await this.prisma.userInterest.findMany({
            where: { userId },
        });
        const interestMap = new Map(interests.map(i => [i.interest.toLowerCase(), i.score]));
        const follows = await this.prisma.followRelation.findMany({
            where: { followerId: userId, status: 'accepted' },
            select: { followingId: true }
        });
        const followedIds = follows.map(f => f.followingId);
        let posts = await this.prisma.post.findMany({
            where: {
                status: 'published',
            },
            include: {
                user: true,
                media: true,
            },
        });
        if (category !== 'all') {
            const cat = category.toLowerCase();
            posts = posts.filter(post => {
                if (cat === 'reels') {
                    return post.type === 'video';
                }
                if (cat === 'photos') {
                    return post.type === 'image';
                }
                if (cat === 'videos') {
                    return post.type === 'video';
                }
                if (cat === 'communities') {
                    return false;
                }
                const content = post.content?.toLowerCase() || '';
                return content.includes(cat) || content.includes(`#${cat}`);
            });
        }
        const scoredPosts = posts.map(post => {
            const isFollowed = followedIds.includes(post.userId) ? 1.0 : 0.0;
            const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
            const gravityDecay = 1.0 / Math.pow(ageHours + 2.0, 1.8);
            const baseScore = (0.35 * (post.watchTimeTotal || 0.0)) +
                (0.20 * (post.savesCount || 0)) +
                (0.15 * (post.sharesCount || 0)) +
                (0.10 * (post.thundersCount || 0)) +
                (0.10 * (post.commentsCount || 0)) +
                (0.05 * isFollowed);
            let interestScore = 0;
            const content = post.content?.toLowerCase() || '';
            interestMap.forEach((score, interest) => {
                if (content.includes(interest)) {
                    interestScore += score;
                }
            });
            const totalScore = (baseScore + interestScore + 1.0) * gravityDecay;
            return { post, totalScore };
        });
        scoredPosts.sort((a, b) => b.totalScore - a.totalScore);
        const finalPosts = [];
        const seenUsers = new Set();
        const deferred = [];
        for (const scored of scoredPosts) {
            const uId = scored.post.userId;
            if (!seenUsers.has(uId)) {
                finalPosts.push(scored.post);
                seenUsers.add(uId);
            }
            else {
                deferred.push(scored.post);
            }
        }
        const combined = [...finalPosts, ...deferred];
        return combined.slice(skip, skip + limit);
    }
    async fetchTrendingContent() {
        const posts = await this.prisma.post.findMany({
            where: { status: 'published' },
            select: { content: true }
        });
        const tagsMap = {};
        posts.forEach(p => {
            const tags = p.content?.match(/#[a-zA-Z0-9]+/g) || [];
            tags.forEach(t => {
                tagsMap[t] = (tagsMap[t] || 0) + 1;
            });
        });
        const trendingHashtags = Object.entries(tagsMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);
        const trendingSearches = await this.prisma.trendingSearch.findMany({
            orderBy: { count: 'desc' },
            take: 5,
        });
        const creators = await this.prisma.userProfile.findMany({
            orderBy: { followersCount: 'desc' },
            take: 5,
        });
        return {
            hashtags: trendingHashtags,
            searches: trendingSearches.map(s => s.query),
            creators,
        };
    }
    async fetchSearchSuggestions(query) {
        if (!query)
            return [];
        const searchVal = query.toLowerCase();
        const profiles = await this.prisma.userProfile.findMany({
            where: {
                OR: [
                    { username: { contains: searchVal, mode: 'insensitive' } },
                    { displayName: { contains: searchVal, mode: 'insensitive' } }
                ]
            },
            take: 5,
        });
        const searches = await this.prisma.trendingSearch.findMany({
            where: { query: { contains: searchVal, mode: 'insensitive' } },
            take: 5,
        });
        const suggestions = [
            ...profiles.map(p => ({ type: 'user', text: p.username, id: p.id, detail: p.displayName })),
            ...searches.map(s => ({ type: 'search', text: s.query }))
        ];
        return suggestions;
    }
    async searchAll(query) {
        const searchVal = query.toLowerCase();
        const users = await this.prisma.userProfile.findMany({
            where: {
                OR: [
                    { username: { contains: searchVal, mode: 'insensitive' } },
                    { displayName: { contains: searchVal, mode: 'insensitive' } }
                ]
            },
            take: 10,
        });
        const communities = await this.prisma.community.findMany({
            where: {
                OR: [
                    { name: { contains: searchVal, mode: 'insensitive' } },
                    { description: { contains: searchVal, mode: 'insensitive' } }
                ]
            },
            take: 10,
        });
        const posts = await this.prisma.post.findMany({
            where: {
                status: 'published',
                content: { contains: searchVal, mode: 'insensitive' }
            },
            include: {
                user: true,
                media: true
            },
            take: 10,
        });
        return {
            users,
            communities,
            posts,
            reels: posts.filter(p => p.type === 'video'),
        };
    }
    async logSearchQuery(userId, query) {
        if (!query || query.trim().length === 0)
            return;
        const cleanQuery = query.trim().toLowerCase();
        await this.prisma.searchHistory.create({
            data: {
                userId,
                query: cleanQuery,
            },
        });
        const existing = await this.prisma.trendingSearch.findUnique({
            where: { query: cleanQuery },
        });
        if (existing) {
            await this.prisma.trendingSearch.update({
                where: { query: cleanQuery },
                data: { count: existing.count + 1 },
            });
        }
        else {
            await this.prisma.trendingSearch.create({
                data: { query: cleanQuery, count: 1 },
            });
        }
        const tags = cleanQuery.split(' ').filter(word => word.length > 3);
        for (const tag of tags) {
            const interest = await this.prisma.userInterest.findUnique({
                where: {
                    userId_interest: { userId, interest: tag },
                },
            });
            if (interest) {
                await this.prisma.userInterest.update({
                    where: { id: interest.id },
                    data: { score: interest.score + 0.1 },
                });
            }
            else {
                await this.prisma.userInterest.create({
                    data: { userId, interest: tag, score: 0.1 },
                });
            }
        }
    }
};
exports.ExploreService = ExploreService;
exports.ExploreService = ExploreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExploreService);
//# sourceMappingURL=explore.service.js.map