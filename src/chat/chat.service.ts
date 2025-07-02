import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chat } from './entity/chat.entity';
import { User } from 'src/user/entity/user.entity';
import { ContactService } from 'src/contact/contact.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private chatRepo: Repository<Chat>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private contactService: ContactService,
    private eventEmitter: EventEmitter2,
  ) {}

  async saveMessage(
    senderUsername: string,
    receiverUsername: string,
    message: string,
  ) {
    console.log('message saved successfully');
    if (message.trim().length > 1000) {
      throw new HttpException(
        'Message exceeds maximum length of 1000 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sender = await this.userRepo.findOne({
      where: { username: senderUsername },
      select: ['id', 'username'],
    });
    const receiver = await this.userRepo.findOne({
      where: { username: receiverUsername },
      select: ['id', 'username'],
    });

    if (!sender) {
      throw new HttpException('Sender not found', HttpStatus.NOT_FOUND);
    }
    if (!receiver) {
      throw new HttpException('Receiver not found', HttpStatus.NOT_FOUND);
    }

    const areContacts = await this.contactService.areContacts(
      sender.id,
      receiver.id,
    );
    if (!areContacts) {
      throw new HttpException('Users are not contacts', HttpStatus.FORBIDDEN);
    }

    const chat = this.chatRepo.create({
      sender: { id: sender.id },
      receiver: { id: receiver.id },
      message,
      status: 'sent',
    });

    const savedMessage = await this.chatRepo.save(chat);

    // Emit real-time event
    this.eventEmitter.emit('message.sent', {
      message: savedMessage,
      senderId: sender.id,
      receiverId: receiver.id,
    });

    return {
      ...savedMessage,
      sender: { id: sender.id, username: sender.username },
      receiver: { id: receiver.id, username: receiver.username },
    };
  }

  async getChatHistory(
    userAUsername: string,
    userBUsername: string,
    currentUserId: number,
    page: number = 1,
    limit: number = 20,
  ) {
    if (!userAUsername || !userBUsername) {
      throw new HttpException('Invalid usernames', HttpStatus.BAD_REQUEST);
    }
    const userA = await this.userRepo.findOne({
      where: { username: userAUsername },
      select: ['id'],
    });
    const userB = await this.userRepo.findOne({
      where: { username: userBUsername },
      select: ['id'],
    });
    if (!userA || !userB) {
      throw new HttpException(
        'One or both users not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (userA.id !== currentUserId && userB.id !== currentUserId) {
      throw new HttpException(
        'Not authorized to view chat history',
        HttpStatus.FORBIDDEN,
      );
    }
    const userAId = userA.id;
    const userBId = userB.id;
    const messages = await this.chatRepo.find({
      where: [
        { sender: { id: userAId }, receiver: { id: userBId } },
        { sender: { id: userBId }, receiver: { id: userAId } },
      ],
      relations: ['sender', 'receiver'],
      select: {
        sender: { id: true, username: true },
        receiver: { id: true, username: true },
      },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      messages: messages.map((msg) => ({
        id: msg.id,
        sender: { id: msg.sender.id, username: msg.sender.username },
        receiver: { id: msg.receiver.id, username: msg.receiver.username },
        message: msg.message,
        status: msg.status,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      })),
      hasMore: messages.length === limit,
    };
  }

  async editMessage(messageId: number, userId: number, newMessage: string) {
    const message = await this.chatRepo.findOne({
      where: { id: messageId, sender: { id: userId } },
      relations: ['sender', 'receiver'],
      select: {
        sender: { id: true, username: true },
        receiver: { id: true, username: true },
      },
    });
    if (!message) {
      throw new HttpException(
        'Message not found or not authorized',
        HttpStatus.NOT_FOUND,
      );
    }
    message.message = newMessage;
    message.updatedAt = new Date();
    const updatedMessage = await this.chatRepo.save(message);
    // Emit event for real-time update
    this.eventEmitter.emit('message.edited', {
      messageId: updatedMessage.id,
      senderId: message.sender.id,
      receiverId: message.receiver.id,
      newMessage: updatedMessage.message,
    });
    return {
      id: updatedMessage.id,
      sender: { id: message.sender.id, username: message.sender.username },
      receiver: {
        id: message.receiver.id,
        username: message.receiver.username,
      },
      message: updatedMessage.message,
      status: updatedMessage.status,
      createdAt: updatedMessage.createdAt,
      updatedAt: updatedMessage.updatedAt,
    };
  }

  async deleteMessage(messageId: number, userId: number) {
    const message = await this.chatRepo.findOne({
      where: { id: messageId, sender: { id: userId } },
      relations: ['sender', 'receiver'],
      select: {
        sender: { id: true, username: true },
        receiver: { id: true, username: true },
      },
    });
    if (!message) {
      throw new HttpException(
        'Message not found or not authorized',
        HttpStatus.NOT_FOUND,
      );
    }
    // Emit event before deletion for real-time update
    this.eventEmitter.emit('message.deleted', {
      messageId: message.id,
      senderId: message.sender.id,
      receiverId: message.receiver.id,
    });
    await this.chatRepo.delete(messageId);
    return { message: 'Message deleted successfully' };
  }

  async getMessageById(id: number) {
    return this.chatRepo.findOne({
      where: { id },
      relations: ['sender', 'receiver'],
      select: {
        id: true,
        message: true,
        sender: { id: true, username: true },
        receiver: { id: true, username: true },
      },
    });
  }
}
