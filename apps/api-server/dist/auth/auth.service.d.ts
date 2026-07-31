import { PrismaService } from '../prisma.service';
export declare class AuthService {
    private prisma;
    constructor(prisma: PrismaService);
    registerDeviceKey(userId: string, deviceId: string, identityKey: string, signedPrekey: string, prekeySignature: string): Promise<any>;
}
