import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { User } from 'src/user/entity/user.entity';
import { Chat } from './entity/chat.entity';
import { ContactRequest } from 'src/contact/entity/contact-request.entity';
import { ContactService } from 'src/contact/contact.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Chat, ContactRequest]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key', // Replace with your JWT secret
      signOptions: { expiresIn: '1d' }, // Match your auth module's settings
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, ContactService],
})
export class ChatModule {}
