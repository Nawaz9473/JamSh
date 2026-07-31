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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma.service");
let AdminService = class AdminService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async fetchReports() {
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
    async resolveReport(reportId, action) {
        const report = await this.prisma.client.report.findUnique({
            where: { id: reportId }
        });
        if (!report) {
            throw new common_1.BadRequestException('Report record not found.');
        }
        if (action === 'delete') {
            if (report.commentId) {
                await this.prisma.client.comment.delete({ where: { id: report.commentId } });
            }
            else if (report.postId) {
                await this.prisma.client.post.delete({ where: { id: report.postId } });
            }
        }
        else if (action === 'restrict') {
            if (report.reportedUserId) {
                await this.prisma.client.userProfile.update({
                    where: { id: report.reportedUserId },
                    data: { isVerified: false, bio: '🚫 Account restricted by administrator.' }
                });
            }
        }
        await this.prisma.client.report.update({
            where: { id: reportId },
            data: { status: 'resolved' }
        });
    }
    async fetchPlatformStats() {
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map