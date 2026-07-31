import { Controller, Post, Body, UseGuards, UnauthorizedException, Injectable, CanActivate, ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthService } from './auth.service';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://czxoschackeetzspupxh.supabase.co';

import * as ws from 'ws';
const WebSocket = (ws as any).default || ws;
(global as any).WebSocket = WebSocket;

const supabaseAnonKey = 
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    transport: WebSocket,
  },
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token missing.');
    }
    const token = authHeader.split(' ')[1];
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        throw new UnauthorizedException('Invalid or expired authentication token.');
      }
      // Populate user info with sub matching user.id for controller backward compatibility
      request['user'] = { ...user, sub: user.id };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
  }
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Post('device-key')
  async registerKey(@CurrentUser() user: any, @Body() body: any) {
    const { deviceId, identityKey, signedPrekey, prekeySignature } = body;
    return await this.authService.registerDeviceKey(
      user.sub,
      deviceId,
      identityKey,
      signedPrekey,
      prekeySignature
    );
  }
}

