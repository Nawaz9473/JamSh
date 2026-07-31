import { Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { CreatorService } from './creator.service';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.controller';

@Controller('creator')
@UseGuards(JwtAuthGuard)
export class CreatorController {
  constructor(private creatorService: CreatorService) {}

  @Post('channel')
  async createChannel(@CurrentUser() user: any, @Body() body: any) {
    const { name, description } = body;
    return await this.creatorService.createChannel(user.sub, name, description);
  }

  @Post('upload')
  async uploadContent(@CurrentUser() user: any, @Body() body: any) {
    const { channelId, title, description, mediaUrl, isExclusive, price } = body;
    return await this.creatorService.uploadContent(
      user.sub,
      channelId,
      title,
      description,
      mediaUrl,
      isExclusive || false,
      price ? parseFloat(price) : 0.0
    );
  }

  @Get('channel/:channelId')
  async getChannelContent(@CurrentUser() user: any, @Param('channelId') channelId: string) {
    return await this.creatorService.fetchExclusiveContent(channelId, user.sub);
  }

  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  async unlockContent(@CurrentUser() user: any, @Body() body: any) {
    const { contentId } = body;
    await this.creatorService.unlockContent(user.sub, contentId);
    return { success: true, message: 'Content item unlocked successfully.' };
  }
}
