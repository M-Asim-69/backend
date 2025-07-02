import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/Jwt/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Post('send')
  async sendMessage(
    @Req() req: Request,
    @Body('receiverUsername') receiverUsername: string,
    @Body('message') message: string,
  ) {
    if (!receiverUsername || !message) {
      throw new HttpException(
        'receiverUsername and message are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const senderUsername = req.user.username;
    const savedMessage = await this.chatService.saveMessage(
      senderUsername,
      receiverUsername,
      message,
    );
    console.log(
      `[API] Message sent: id=${savedMessage.id}, sender=${senderUsername}, receiver=${receiverUsername}`,
    );
    // Emit real-time event to both sender and receiver
    this.chatGateway.emitNewMessage(savedMessage);
    return savedMessage;
  }

  @Get('history')
  async getChatHistory(
    @Query('userA') userAUsername: string,
    @Query('userB') userBUsername: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
    @Req() req: Request,
  ) {
    const currentUserId = req.user.userId;
    return this.chatService.getChatHistory(
      userAUsername,
      userBUsername,
      currentUserId,
      page,
      limit,
    );
  }

  @Patch('edit/:id')
  async editMessage(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Body('message') message: string,
  ) {
    if (!message) {
      throw new HttpException(
        'Message content is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const userId = req.user.userId;
    const updated = await this.chatService.editMessage(id, userId, message);
    console.log(`[API] Message edited: id=${id}, by userId=${userId}`);
    // Emit real-time event to both sender and receiver
    this.chatGateway.handleMessageEdited({
      messageId: id,
      senderId: updated.sender.id,
      receiverId: updated.receiver.id,
      newMessage: message,
    });
    return updated;
  }

  @Delete('delete/:id')
  async deleteMessage(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const userId = req.user.userId;
    // Fetch the message directly
    const msg = await this.chatService.getMessageById(id);
    const result = await this.chatService.deleteMessage(id, userId);
    if (msg) {
      console.log(`[API] Message deleted: id=${id}, by userId=${userId}`);
      // Emit real-time event to both sender and receiver
      this.chatGateway.handleMessageDeleted({
        messageId: id,
        senderId: msg.sender.id,
        receiverId: msg.receiver.id,
      });
    }
    return result;
  }
}
