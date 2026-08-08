import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService) {}

  async fetchFeed(userId: string, page = 0, limit = 10): Promise<any[]> {
    // 1. Fetch profiles followed by current user
    const follows = await this.prisma.client.followRelation.findMany({
      where: { followerId: userId, status: 'accepted' },
      select: { followingId: true }
    });
    const followedIds = follows.map(f => f.followingId);

    // 2. Fetch posts. If user follows creators, filter feed to show self & followed posts first,
    // otherwise show public posts.
    const queryFilter: any = { status: 'published' };
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

    // Determine thunder reactions
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

  async createPost(userId: string, content: string, type: string, mediaUrls: string[]): Promise<any> {
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

  async toggleThunder(userId: string, postId: string, commentId?: string): Promise<{ thundered: boolean; countChange: number }> {
    const queryFilter: any = { userId };
    if (commentId) {
      queryFilter['commentId'] = commentId;
    } else {
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
      } else {
        await this.prisma.client.post.update({
          where: { id: postId },
          data: { thundersCount: { decrement: 1 } }
        });
      }
      return { thundered: false, countChange };
    } else {
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
      } else {
        await this.prisma.client.post.update({
          where: { id: postId },
          data: { thundersCount: { increment: 1 } }
        });
      }
      return { thundered: true, countChange };
    }
  }

  async addComment(userId: string, postId: string, content: string, parentId?: string): Promise<any> {
    const post = await this.prisma.client.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    // Block check
    await this.checkBlockStatus(userId, post.userId);

    // Spam Check
    const lastComment = await this.prisma.client.comment.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    if (lastComment && (Date.now() - new Date(lastComment.createdAt).getTime()) < 3000) {
      throw new BadRequestException('Please wait 3 seconds before posting another comment');
    }

    // Profanity Filter (AI Moderation Pipeline)
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

    // Dispatch Notification
    if (post.userId !== userId) {
      await this.createNotification(post.userId, userId, 'comment', postId, comment.id);
    }
    if (parentId) {
      const parentComment = await this.prisma.client.comment.findUnique({ where: { id: parentId } });
      if (parentComment && parentComment.userId !== userId) {
        await this.createNotification(parentComment.userId, userId, 'reply', postId, comment.id);
      }
    }

    // Mention check
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

  async editComment(userId: string, commentId: string, content: string): Promise<any> {
    const comment = await this.prisma.client.comment.findUnique({
      where: { id: commentId }
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException('Cannot edit other user comments');

    if (content.toLowerCase().trim() === comment.content.toLowerCase().trim()) {
      throw new BadRequestException('Duplicate comment content detected');
    }

    const cleanContent = this.moderateContent(content);

    return await this.prisma.client.comment.update({
      where: { id: commentId },
      data: { content: cleanContent },
      include: { user: true }
    });
  }

  async deleteComment(userId: string, commentId: string): Promise<any> {
    const comment = await this.prisma.client.comment.findUnique({
      where: { id: commentId }
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException('Cannot delete other user comments');

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

  async fetchComments(postId: string, sortBy = 'newest', page = 0, limit = 10): Promise<any[]> {
    const skip = page * limit;
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (sortBy === 'top') {
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

  async toggleSave(userId: string, postId: string): Promise<any> {
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
    } else {
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

  async shareContent(userId: string, postId: string, targetType = 'external', targetId?: string): Promise<any> {
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

  async logPostView(userId: string | null, postId: string, watchTime = 0.0): Promise<any> {
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

  async fetchNotifications(userId: string): Promise<any[]> {
    return await this.prisma.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { sender: true }
    });
  }

  private moderateContent(text: string): string {
    const badWords = ['spam', 'abuse', 'kill', 'hate', 'fudge', 'profanity'];
    let clean = text;
    badWords.forEach(w => {
      const regex = new RegExp(`\\b${w}\\b`, 'gi');
      clean = clean.replace(regex, '***');
    });
    return clean;
  }

  private async checkBlockStatus(userA: string, userB: string): Promise<void> {
    const blocked = await this.prisma.client.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA }
        ]
      }
    });
    if (blocked) {
      throw new ForbiddenException('Interaction blocked between these accounts.');
    }
  }

  private async createNotification(userId: string, senderId: string, type: string, postId?: string, commentId?: string): Promise<any> {
    return await this.prisma.client.notification.create({
      data: { userId, senderId, type, postId, commentId }
    });
  }

  async recalculatePostEngagement(postId: string): Promise<void> {
    const post = await this.prisma.client.post.findUnique({
      where: { id: postId }
    });
    if (!post) return;

    const engagementScore = 
      (post.watchTimeTotal * 2.0) + 
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

  async createStory(userId: string, mediaUrl: string, mediaType: string): Promise<any> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return await this.prisma.client.story.create({
      data: {
        userId,
        mediaUrl,
        mediaType: mediaType || 'image',
        expiresAt,
      }
    });
  }

  async fetchStories(): Promise<any[]> {
    return await this.prisma.client.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
  }


  async fileReport(userId: string, reportedUserId?: string, postId?: string, commentId?: string, reason?: string): Promise<any> {
    if (!reportedUserId && !postId && !commentId) {
      throw new BadRequestException('Report target must be specified.');
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
}
