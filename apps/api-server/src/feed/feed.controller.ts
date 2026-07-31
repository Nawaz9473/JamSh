import { Controller, Post, Get, Put, Delete, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { FeedService } from './feed.service';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.controller';

@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private feedService: FeedService) {}

  @Get()
  async getFeed(@CurrentUser() user: any, @Query('page') page: string, @Query('limit') limit: string) {
    const p = page ? parseInt(page, 10) : 0;
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.feedService.fetchFeed(user.sub, p, l);
  }

  @Post('post')
  async createPost(@CurrentUser() user: any, @Body() body: any) {
    const { content, type, mediaUrls } = body;
    return await this.feedService.createPost(user.sub, content, type || 'text', mediaUrls || []);
  }

  @Post('thunder')
  @HttpCode(HttpStatus.OK)
  async toggleThunder(@CurrentUser() user: any, @Body() body: any) {
    const { postId, commentId } = body;
    return await this.feedService.toggleThunder(user.sub, postId, commentId);
  }

  @Post('comment')
  async addComment(@CurrentUser() user: any, @Body() body: any) {
    const { postId, content, parentId } = body;
    return await this.feedService.addComment(user.sub, postId, content, parentId);
  }

  @Put('comment')
  async editComment(@CurrentUser() user: any, @Body() body: any) {
    const { commentId, content } = body;
    return await this.feedService.editComment(user.sub, commentId, content);
  }

  @Delete('comment')
  async deleteComment(@CurrentUser() user: any, @Query('id') commentId: string) {
    return await this.feedService.deleteComment(user.sub, commentId);
  }

  @Get('comments')
  async getComments(
    @Query('postId') postId: string,
    @Query('sortBy') sortBy: string,
    @Query('page') page: string,
    @Query('limit') limit: string
  ) {
    const p = page ? parseInt(page, 10) : 0;
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.feedService.fetchComments(postId, sortBy || 'newest', p, l);
  }

  @Post('save')
  async toggleSave(@CurrentUser() user: any, @Body() body: any) {
    const { postId } = body;
    return await this.feedService.toggleSave(user.sub, postId);
  }

  @Post('share')
  async shareContent(@CurrentUser() user: any, @Body() body: any) {
    const { postId, targetType, targetId } = body;
    return await this.feedService.shareContent(user.sub, postId, targetType, targetId);
  }

  @Post('view')
  @HttpCode(HttpStatus.OK)
  async logPostView(@CurrentUser() user: any, @Body() body: any) {
    const { postId, watchTime } = body;
    return await this.feedService.logPostView(user.sub, postId, watchTime);
  }

  @Get('notifications')
  async getNotifications(@CurrentUser() user: any) {
    return await this.feedService.fetchNotifications(user.sub);
  }

  @Post('story')
  async createStory(@CurrentUser() user: any, @Body() body: any) {
    const { mediaUrl, mediaType } = body;
    return await this.feedService.createStory(user.sub, mediaUrl, mediaType || 'image');
  }

  @Get('stories')
  async getStories() {
    return await this.feedService.fetchStories();
  }

  @Post('report')
  async fileReport(@CurrentUser() user: any, @Body() body: any) {
    const { reportedUserId, postId, commentId, reason } = body;
    return await this.feedService.fileReport(user.sub, reportedUserId, postId, commentId, reason);
  }
}
