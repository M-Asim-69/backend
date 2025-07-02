import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';

import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/Jwt/jwt-auth.guard';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('search')
  async searchUsers(@Query('query') query: string, @Req() req: Request) {
    const currentUserId = req.user.userId;
    return this.userService.searchUsers(query, currentUserId);
  }
}
