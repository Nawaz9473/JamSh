import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async registerDeviceKey(userId: string, deviceId: string, identityKey: string, signedPrekey: string, prekeySignature: string): Promise<any> {
    const existing = await this.prisma.client.deviceKey.findFirst({
      where: { userId, deviceId }
    });
    if (existing) {
      return existing;
    }
    return await this.prisma.client.deviceKey.create({
      data: {
        userId,
        deviceId,
        identityKey,
        signedPrekey,
        prekeySignature,
      }
    });
  }
}

