import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';
export declare class JwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    registerKey(user: any, body: any): Promise<any>;
}
