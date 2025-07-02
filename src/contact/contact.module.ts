import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { ContactRequest } from './entity/contact-request.entity';
import { User } from 'src/user/entity/user.entity';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactRequest, User]),
    EventEmitterModule.forRoot(), // ✅ Added this line
  ],
  providers: [ContactService],
  controllers: [ContactController],
  exports: [ContactService],
})
export class ContactModule {}
