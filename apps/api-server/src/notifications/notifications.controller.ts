import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.controller';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * Fetches paginated, category-filtered, and grouped notifications for the current user
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    const pageNum = parseInt(page || '0', 10);
    const limitNum = parseInt(limit || '20', 10);
    return await this.notificationsService.getNotifications(user.sub, pageNum, limitNum, category);
  }

  /**
   * GET /notifications/unread
   * Returns unread summaries grouped by Messages, Notifications, Communities, and Requests
   */
  @Get('unread')
  async getUnreadCounts(@CurrentUser() user: any) {
    return await this.notificationsService.getUnreadCounts(user.sub);
  }

  /**
   * GET /notifications/count
   * Returns the total sum of unread notifications
   */
  @Get('count')
  async getTotalUnreadCount(@CurrentUser() user: any) {
    const counts = await this.notificationsService.getUnreadCounts(user.sub);
    return { count: counts.messages + counts.notifications + counts.communities + counts.requests };
  }

  /**
   * PATCH /notifications/read/:id
   * Marks a specific notification as read
   */
  @Patch('read/:id')
  async markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return await this.notificationsService.markAsRead(id, user.sub);
  }

  /**
   * PATCH /notifications/read-all
   * Marks all notifications as read for the current user
   */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser() user: any) {
    return await this.notificationsService.markAllAsRead(user.sub);
  }

  /**
   * DELETE /notifications/:id
   * Soft-deletes a notification
   */
  @Delete(':id')
  async deleteNotification(@CurrentUser() user: any, @Param('id') id: string) {
    return await this.notificationsService.softDelete(id, user.sub);
  }

  /**
   * GET /notifications/preferences
   * Fetches the user's notification preferences
   */
  @Get('preferences')
  async getPreferences(@CurrentUser() user: any) {
    return await this.notificationsService.getPreferences(user.sub);
  }

  /**
   * PATCH /notifications/preferences
   * Updates the user's notification preferences
   */
  @Patch('preferences')
  async updatePreferences(@CurrentUser() user: any, @Body() body: any) {
    return await this.notificationsService.updatePreferences(user.sub, body);
  }

  /**
   * POST /notifications/analytics
   * Tracks user interaction events (opened, clicked, dismissed)
   */
  @Post('analytics')
  @HttpCode(HttpStatus.CREATED)
  async trackAnalytics(
    @Body() body: { notificationId: string; status: string; deviceType?: string },
  ) {
    const { notificationId, status, deviceType } = body;
    await this.notificationsService.trackAnalytics(notificationId, status, deviceType);
    return { success: true };
  }
}
