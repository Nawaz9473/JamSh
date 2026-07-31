import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.controller';

@Controller('explore')
@UseGuards(JwtAuthGuard)
export class ExploreController {
  constructor(private exploreService: ExploreService) {}

  @Get()
  async getExploreFeed(
    @CurrentUser() user: any,
    @Query('category') category: string,
    @Query('page') page: string,
    @Query('limit') limit: string
  ) {
    const p = page ? parseInt(page, 10) : 0;
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.exploreService.fetchExploreFeed(user.sub, category || 'all', p, l);
  }

  @Get('trending')
  async getTrendingContent() {
    return await this.exploreService.fetchTrendingContent();
  }

  @Get('suggestions')
  async getSearchSuggestions(@Query('q') query: string) {
    return await this.exploreService.fetchSearchSuggestions(query || '');
  }

  @Get('results')
  async getSearchResults(@Query('q') query: string) {
    return await this.exploreService.searchAll(query || '');
  }

  @Post('history')
  async logSearchQuery(@CurrentUser() user: any, @Body() body: any) {
    const { query } = body;
    await this.exploreService.logSearchQuery(user.sub, query || '');
    return { success: true };
  }
}
