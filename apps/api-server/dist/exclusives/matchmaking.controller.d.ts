import { MatchmakingService } from './matchmaking.service';
export declare class MatchmakingController {
    private matchmakingService;
    constructor(matchmakingService: MatchmakingService);
    joinQueue(user: any, body: any): Promise<any>;
    checkStatus(user: any): Promise<any>;
    leaveQueue(user: any, body: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
