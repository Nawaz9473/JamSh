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
exports.CreatorController = void 0;
const common_1 = require("@nestjs/common");
const creator_service_1 = require("./creator.service");
const auth_controller_1 = require("../auth/auth.controller");
let CreatorController = class CreatorController {
    constructor(creatorService) {
        this.creatorService = creatorService;
    }
    async createChannel(user, body) {
        const { name, description } = body;
        return await this.creatorService.createChannel(user.sub, name, description);
    }
    async uploadContent(user, body) {
        const { channelId, title, description, mediaUrl, isExclusive, price } = body;
        return await this.creatorService.uploadContent(user.sub, channelId, title, description, mediaUrl, isExclusive || false, price ? parseFloat(price) : 0.0);
    }
    async getChannelContent(user, channelId) {
        return await this.creatorService.fetchExclusiveContent(channelId, user.sub);
    }
    async unlockContent(user, body) {
        const { contentId } = body;
        await this.creatorService.unlockContent(user.sub, contentId);
        return { success: true, message: 'Content item unlocked successfully.' };
    }
};
exports.CreatorController = CreatorController;
__decorate([
    (0, common_1.Post)('channel'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CreatorController.prototype, "createChannel", null);
__decorate([
    (0, common_1.Post)('upload'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CreatorController.prototype, "uploadContent", null);
__decorate([
    (0, common_1.Get)('channel/:channelId'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CreatorController.prototype, "getChannelContent", null);
__decorate([
    (0, common_1.Post)('unlock'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CreatorController.prototype, "unlockContent", null);
exports.CreatorController = CreatorController = __decorate([
    (0, common_1.Controller)('creator'),
    (0, common_1.UseGuards)(auth_controller_1.JwtAuthGuard),
    __metadata("design:paramtypes", [creator_service_1.CreatorService])
], CreatorController);
//# sourceMappingURL=creator.controller.js.map