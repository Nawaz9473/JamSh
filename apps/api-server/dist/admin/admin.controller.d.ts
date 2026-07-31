import { AdminService } from './admin.service';
export declare class AdminController {
    private adminService;
    constructor(adminService: AdminService);
    getReports(): Promise<any[]>;
    resolveReport(body: any): Promise<{
        success: boolean;
        message: string;
    }>;
    getStats(): Promise<any>;
}
