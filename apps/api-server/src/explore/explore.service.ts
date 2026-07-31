import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ExploreService {
  constructor(private prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.client;
  }

  async fetchExploreFeed(userId: string, category: string = 'all', page: number = 0, limit: number = 10) {
    const skip = page * limit;

    // Fetch user interests to apply personalized recommendations
    const interests = await this.prisma.userInterest.findMany({
      where: { userId },
    });
    const interestMap = new Map<string, number>(interests.map(i => [i.interest.toLowerCase(), i.score]));

    // Fetch followed IDs for follow probability
    const follows = await this.prisma.followRelation.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followingId: true }
    });
    const followedIds = follows.map(f => f.followingId);

    // Fetch posts & media
    let posts = await this.prisma.post.findMany({
      where: {
        status: 'published',
      },
      include: {
        user: true,
        media: true,
      },
    });

    // Apply category filters
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

    // Rank content dynamically using weighted recommendation factors
    const scoredPosts = posts.map(post => {
      const isFollowed = followedIds.includes(post.userId) ? 1.0 : 0.0;
      const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      const gravityDecay = 1.0 / Math.pow(ageHours + 2.0, 1.8);

      // Score = 0.35 * WatchTime + 0.20 * Saves + 0.15 * Shares + 0.10 * Thunder + 0.10 * Comments + 0.05 * Follow
      const baseScore = 
        (0.35 * (post.watchTimeTotal || 0.0)) + 
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

    // Sort by score descending
    scoredPosts.sort((a, b) => b.totalScore - a.totalScore);

    // Diversity Pass: prevent same user showing up consecutively
    const finalPosts = [];
    const seenUsers = new Set();
    const deferred = [];

    for (const scored of scoredPosts) {
      const uId = scored.post.userId;
      if (!seenUsers.has(uId)) {
        finalPosts.push(scored.post);
        seenUsers.add(uId);
      } else {
        deferred.push(scored.post);
      }
    }

    const combined = [...finalPosts, ...deferred];

    // Return paginated chunk
    return combined.slice(skip, skip + limit);
  }

  async fetchTrendingContent() {
    // 1. Trending hashtags extracted from posts
    const posts = await this.prisma.post.findMany({
      where: { status: 'published' },
      select: { content: true }
    });

    const tagsMap: Record<string, number> = {};
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

    // 2. Trending searches
    const trendingSearches = await this.prisma.trendingSearch.findMany({
      orderBy: { count: 'desc' },
      take: 5,
    });

    // 3. Trending creators (top following/followers)
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

  async fetchSearchSuggestions(query: string) {
    if (!query) return [];
    const searchVal = query.toLowerCase();

    // Fetch matched profiles
    const profiles = await this.prisma.userProfile.findMany({
      where: {
        OR: [
          { username: { contains: searchVal, mode: 'insensitive' } },
          { displayName: { contains: searchVal, mode: 'insensitive' } }
        ]
      },
      take: 5,
    });

    // Fetch matched trending searches
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

  async searchAll(query: string) {
    const searchVal = query.toLowerCase();

    // 1. Fuzzy users
    const users = await this.prisma.userProfile.findMany({
      where: {
        OR: [
          { username: { contains: searchVal, mode: 'insensitive' } },
          { displayName: { contains: searchVal, mode: 'insensitive' } }
        ]
      },
      take: 10,
    });

    // 2. Fuzzy communities
    const communities = await this.prisma.community.findMany({
      where: {
        OR: [
          { name: { contains: searchVal, mode: 'insensitive' } },
          { description: { contains: searchVal, mode: 'insensitive' } }
        ]
      },
      take: 10,
    });

    // 3. Fuzzy posts / reels
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

  async logSearchQuery(userId: string, query: string) {
    if (!query || query.trim().length === 0) return;
    const cleanQuery = query.trim().toLowerCase();

    // Insert history record
    await this.prisma.searchHistory.create({
      data: {
        userId,
        query: cleanQuery,
      },
    });

    // Increment trending search count
    const existing = await this.prisma.trendingSearch.findUnique({
      where: { query: cleanQuery },
    });

    if (existing) {
      await this.prisma.trendingSearch.update({
        where: { query: cleanQuery },
        data: { count: existing.count + 1 },
      });
    } else {
      await this.prisma.trendingSearch.create({
        data: { query: cleanQuery, count: 1 },
      });
    }

    // Update user interests slightly based on query search terms
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
      } else {
        await this.prisma.userInterest.create({
          data: { userId, interest: tag, score: 0.1 },
        });
      }
    }
  }
}
