import { PrismaService } from '../prisma.service';
export declare class AdminService {
    private prisma;
    constructor(prisma: PrismaService);
    fetchReports(): Promise<any[]>;
    resolveReport(reportId: string, action: 'ignore' | 'restrict' | 'delete'): Promise<void>;
    fetchPlatformStats(): Promise<any>;
}
