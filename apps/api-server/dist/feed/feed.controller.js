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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedController = void 0;
const common_1 = require("@nestjs/common");
const feed_service_1 = require("./feed.service");
const auth_controller_1 = require("../auth/auth.controller");
let FeedController = class FeedController {
    constructor(feedService) {
        this.feedService = feedService;
    }
    async getFeed(user, page, limit) {
        const p = page ? parseInt(page, 10) : 0;
        const l = limit ? parseInt(limit, 10) : 10;
        return await this.feedService.fetchFeed(user.sub, p, l);
    }
    async createPost(user, body) {
        const { content, type, mediaUrls } = body;
        return await this.feedService.createPost(user.sub, content, type || 'text', mediaUrls || []);
    }
    async toggleThunder(user, body) {
        const { postId, commentId } = body;
        return await this.feedService.toggleThunder(user.sub, postId, commentId);
    }
    async addComment(user, body) {
        const { postId, content, parentId } = body;
        return await this.feedService.addComment(user.sub, postId, content, parentId);
    }
    async editComment(user, body) {
        const { commentId, content } = body;
        return await this.feedService.editComment(user.sub, commentId, content);
    }
    async deleteComment(user, commentId) {
        return await this.feedService.deleteComment(user.sub, commentId);
    }
    async getComments(postId, sortBy, page, limit) {
        const p = page ? parseInt(page, 10) : 0;
        const l = limit ? parseInt(limit, 10) : 10;
        return await this.feedService.fetchComments(postId, sortBy || 'newest', p, l);
    }
    async toggleSave(user, body) {
        const { postId } = body;
        return await this.feedService.toggleSave(user.sub, postId);
    }
    async shareContent(user, body) {
        const { postId, targetType, targetId } = body;
        return await this.feedService.shareContent(user.sub, postId, targetType, targetId);
    }
    async logPostView(user, body) {
        const { postId, watchTime } = body;
        return await this.feedService.logPostView(user.sub, postId, watchTime);
    }
    async getNotifications(user) {
        return await this.feedService.fetchNotifications(user.sub);
    }
    async createStory(user, body) {
        const { mediaUrl, mediaType } = body;
        return await this.feedService.createStory(user.sub, mediaUrl, mediaType || 'image');
    }
    async getStories() {
        return await this.feedService.fetchStories();
    }
    async fileReport(user, body) {
        const { reportedUserId, postId, commentId, reason } = body;
        return await this.feedService.fileReport(user.sub, reportedUserId, postId, commentId, reason);
    }
};
exports.FeedController = FeedController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Post)('post'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "createPost", null);
__decorate([
    (0, common_1.Post)('thunder'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "toggleThunder", null);
__decorate([
    (0, common_1.Post)('comment'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "addComment", null);
__decorate([
    (0, common_1.Put)('comment'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "editComment", null);
__decorate([
    (0, common_1.Delete)('comment'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "deleteComment", null);
__decorate([
    (0, common_1.Get)('comments'),
    __param(0, (0, common_1.Query)('postId')),
    __param(1, (0, common_1.Query)('sortBy')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "getComments", null);
__decorate([
    (0, common_1.Post)('save'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "toggleSave", null);
__decorate([
    (0, common_1.Post)('share'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "shareContent", null);
__decorate([
    (0, common_1.Post)('view'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "logPostView", null);
__decorate([
    (0, common_1.Get)('notifications'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Post)('story'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "createStory", null);
__decorate([
    (0, common_1.Get)('stories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "getStories", null);
__decorate([
    (0, common_1.Post)('report'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "fileReport", null);
exports.FeedController = FeedController = __decorate([
    (0, common_1.Controller)('feed'),
    (0, common_1.UseGuards)(auth_controller_1.JwtAuthGuard),
    __metadata("design:paramtypes", [feed_service_1.FeedService])
], FeedController);
//# sourceMappingURL=feed.controller.js.map