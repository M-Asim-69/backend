import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { ContactService } from './contact.service';

import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/Jwt/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Post('request')
  async sendContactRequest(
    @Req() req: Request,
    @Body('receiverId') receiverId: number,
  ) {
    const senderId = req.user.userId;
    return this.contactService.sendContactRequest(senderId, receiverId);
  }

  @Get('requests')
  async getPendingRequests(@Req() req: Request) {
    const receiverId = req.user.userId;
    return this.contactService.getPendingRequests(receiverId);
  }

  @Patch('accept/:id')
  async acceptContactRequest(@Param('id') id: number, @Req() req: Request) {
    const receiverId = req.user.userId;
    return this.contactService.acceptContactRequest(id, receiverId);
  }

  @Delete('reject/:id')
  async rejectContactRequest(@Param('id') id: number, @Req() req: Request) {
    const receiverId = req.user.userId;
    return this.contactService.rejectContactRequest(id, receiverId);
  }

  @Get('list')
  async getContacts(@Req() req: Request) {
    const userId = req.user.userId;
    return this.contactService.getContacts(userId);
  }
}
