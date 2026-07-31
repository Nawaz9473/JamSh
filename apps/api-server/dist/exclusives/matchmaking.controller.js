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
exports.MatchmakingController = void 0;
const common_1 = require("@nestjs/common");
const matchmaking_service_1 = require("./matchmaking.service");
const auth_controller_1 = require("../auth/auth.controller");
let MatchmakingController = class MatchmakingController {
    constructor(matchmakingService) {
        this.matchmakingService = matchmakingService;
    }
    async joinQueue(user, body) {
        const { gender, filter } = body;
        return await this.matchmakingService.joinQueue(user.sub, gender || 'Any', filter || 'Any');
    }
    async checkStatus(user) {
        return await this.matchmakingService.checkMatchStatus(user.sub);
    }
    async leaveQueue(user, body) {
        const { gender, filter } = body;
        await this.matchmakingService.leaveQueue(user.sub, gender || 'Any', filter || 'Any');
        return { success: true, message: 'Queue left successfully.' };
    }
};
exports.MatchmakingController = MatchmakingController;
__decorate([
    (0, common_1.Post)('random/join'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingController.prototype, "joinQueue", null);
__decorate([
    (0, common_1.Get)('random/status'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MatchmakingController.prototype, "checkStatus", null);
__decorate([
    (0, common_1.Post)('random/leave'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingController.prototype, "leaveQueue", null);
exports.MatchmakingController = MatchmakingController = __decorate([
    (0, common_1.Controller)('matchmaking'),
    (0, common_1.UseGuards)(auth_controller_1.JwtAuthGuard),
    __metadata("design:paramtypes", [matchmaking_service_1.MatchmakingService])
], MatchmakingController);
//# sourceMappingURL=matchmaking.controller.js.map