import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/auth.controller';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('reports')
  async getReports() {
    return await this.adminService.fetchReports();
  }

  @Post('reports/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveReport(@Body() body: any) {
    const { reportId, action } = body; // action is: ignore, restrict, delete
    await this.adminService.resolveReport(reportId, action);
    return { success: true, message: `Report resolved with action: ${action}.` };
  }

  @Get('stats')
  async getStats() {
    return await this.adminService.fetchPlatformStats();
  }
}
