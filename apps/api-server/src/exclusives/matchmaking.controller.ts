import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.controller';

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(private matchmakingService: MatchmakingService) {}

  @Post('random/join')
  @HttpCode(HttpStatus.OK)
  async joinQueue(@CurrentUser() user: any, @Body() body: any) {
    const { gender, filter } = body; // filter is what gender they are searching for (Male, Female, Any)
    return await this.matchmakingService.joinQueue(user.sub, gender || 'Any', filter || 'Any');
  }

  @Get('random/status')
  async checkStatus(@CurrentUser() user: any) {
    return await this.matchmakingService.checkMatchStatus(user.sub);
  }

  @Post('random/leave')
  @HttpCode(HttpStatus.OK)
  async leaveQueue(@CurrentUser() user: any, @Body() body: any) {
    const { gender, filter } = body;
    await this.matchmakingService.leaveQueue(user.sub, gender || 'Any', filter || 'Any');
    return { success: true, message: 'Queue left successfully.' };
  }
}
