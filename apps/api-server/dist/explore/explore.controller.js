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
exports.ExploreController = void 0;
const common_1 = require("@nestjs/common");
const explore_service_1 = require("./explore.service");
const auth_controller_1 = require("../auth/auth.controller");
let ExploreController = class ExploreController {
    constructor(exploreService) {
        this.exploreService = exploreService;
    }
    async getExploreFeed(user, category, page, limit) {
        const p = page ? parseInt(page, 10) : 0;
        const l = limit ? parseInt(limit, 10) : 10;
        return await this.exploreService.fetchExploreFeed(user.sub, category || 'all', p, l);
    }
    async getTrendingContent() {
        return await this.exploreService.fetchTrendingContent();
    }
    async getSearchSuggestions(query) {
        return await this.exploreService.fetchSearchSuggestions(query || '');
    }
    async getSearchResults(query) {
        return await this.exploreService.searchAll(query || '');
    }
    async logSearchQuery(user, body) {
        const { query } = body;
        await this.exploreService.logSearchQuery(user.sub, query || '');
        return { success: true };
    }
};
exports.ExploreController = ExploreController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], ExploreController.prototype, "getExploreFeed", null);
__decorate([
    (0, common_1.Get)('trending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExploreController.prototype, "getTrendingContent", null);
__decorate([
    (0, common_1.Get)('suggestions'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExploreController.prototype, "getSearchSuggestions", null);
__decorate([
    (0, common_1.Get)('results'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExploreController.prototype, "getSearchResults", null);
__decorate([
    (0, common_1.Post)('history'),
    __param(0, (0, auth_controller_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExploreController.prototype, "logSearchQuery", null);
exports.ExploreController = ExploreController = __decorate([
    (0, common_1.Controller)('explore'),
    (0, common_1.UseGuards)(auth_controller_1.JwtAuthGuard),
    __metadata("design:paramtypes", [explore_service_1.ExploreService])
], ExploreController);
//# sourceMappingURL=explore.controller.js.map