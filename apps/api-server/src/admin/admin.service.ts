import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async fetchReports(): Promise<any[]> {
    return await this.prisma.client.report.findMany({
      include: {
        reporter: true,
        reportedUser: true,
        post: { include: { media: true } },
        comment: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolveReport(reportId: string, action: 'ignore' | 'restrict' | 'delete'): Promise<void> {
    const report = await this.prisma.client.report.findUnique({
      where: { id: reportId }
    });
    if (!report) {
      throw new BadRequestException('Report record not found.');
    }

    if (action === 'delete') {
      if (report.commentId) {
        await this.prisma.client.comment.delete({ where: { id: report.commentId } });
      } else if (report.postId) {
        await this.prisma.client.post.delete({ where: { id: report.postId } });
      }
    } else if (action === 'restrict') {
      if (report.reportedUserId) {
        await this.prisma.client.userProfile.update({
          where: { id: report.reportedUserId },
          data: { isVerified: false, bio: '🚫 Account restricted by administrator.' }
        });
      }
    }

    // Update status to resolved
    await this.prisma.client.report.update({
      where: { id: reportId },
      data: { status: 'resolved' }
    });
  }

  async fetchPlatformStats(): Promise<any> {
    const usersCount = await this.prisma.client.userProfile.count();
    const postsCount = await this.prisma.client.post.count();
    const commentsCount = await this.prisma.client.comment.count();
    const reportsCount = await this.prisma.client.report.count({
      where: { status: 'pending' }
    });

    return {
      usersCount,
      postsCount,
      commentsCount,
      reportsCount,
    };
  }
}
