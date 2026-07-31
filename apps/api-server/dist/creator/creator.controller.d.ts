import { CreatorService } from './creator.service';
export declare class CreatorController {
    private creatorService;
    constructor(creatorService: CreatorService);
    createChannel(user: any, body: any): Promise<any>;
    uploadContent(user: any, body: any): Promise<any>;
    getChannelContent(user: any, channelId: string): Promise<any[]>;
    unlockContent(user: any, body: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
