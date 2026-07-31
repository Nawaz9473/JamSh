"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("./prisma.service");
const redis_service_1 = require("./redis.service");
const auth_controller_1 = require("./auth/auth.controller");
const auth_service_1 = require("./auth/auth.service");
const feed_controller_1 = require("./feed/feed.controller");
const feed_service_1 = require("./feed/feed.service");
const chat_gateway_1 = require("./chat/chat.gateway");
const matchmaking_controller_1 = require("./exclusives/matchmaking.controller");
const matchmaking_service_1 = require("./exclusives/matchmaking.service");
const creator_controller_1 = require("./creator/creator.controller");
const creator_service_1 = require("./creator/creator.service");
const admin_controller_1 = require("./admin/admin.controller");
const admin_service_1 = require("./admin/admin.service");
const reels_cron_service_1 = require("./feed/reels-cron.service");
const explore_module_1 = require("./explore/explore.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            jwt_1.JwtModule.register({
                global: true,
                secret: process.env.JWT_SECRET || 'jamsh_jwt_super_secret_key_12345',
                signOptions: { expiresIn: '7d' },
            }),
            explore_module_1.ExploreModule,
        ],
        controllers: [
            auth_controller_1.AuthController,
            feed_controller_1.FeedController,
            matchmaking_controller_1.MatchmakingController,
            creator_controller_1.CreatorController,
            admin_controller_1.AdminController,
        ],
        providers: [
            prisma_service_1.PrismaService,
            redis_service_1.RedisService,
            auth_service_1.AuthService,
            feed_service_1.FeedService,
            chat_gateway_1.ChatGateway,
            matchmaking_service_1.MatchmakingService,
            creator_service_1.CreatorService,
            admin_service_1.AdminService,
            reels_cron_service_1.ReelsCronService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map