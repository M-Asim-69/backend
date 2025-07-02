import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entity/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactRequest } from './entity/contact-request.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactRequest)
    private contactRequestRepo: Repository<ContactRequest>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private eventEmitter: EventEmitter2,
  ) {}

  async sendContactRequest(senderId: number, receiverId: number) {
    if (senderId === receiverId) {
      throw new HttpException(
        'Cannot send request to yourself',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sender = await this.userRepo.findOne({ where: { id: senderId } });
    const receiver = await this.userRepo.findOne({ where: { id: receiverId } });

    if (!sender || !receiver) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const areContacts = await this.areContacts(senderId, receiverId);
    if (areContacts) {
      throw new HttpException('Already contacts', HttpStatus.CONFLICT);
    }

    const existingRequest = await this.contactRequestRepo.findOne({
      where: {
        sender: { id: senderId },
        receiver: { id: receiverId },
        status: 'pending',
      },
    });

    if (existingRequest) {
      throw new HttpException('Request already sent', HttpStatus.CONFLICT);
    }

    const request = this.contactRequestRepo.create({
      sender,
      receiver,
      status: 'pending',
    });
    const savedRequest = await this.contactRequestRepo.save(request);

    this.eventEmitter.emit('contact.request.sent', { request: savedRequest });

    return savedRequest;
  }

  async getPendingRequests(receiverId: number) {
    return this.contactRequestRepo.find({
      where: { receiver: { id: receiverId }, status: 'pending' },
      relations: ['sender'],
    });
  }

  async acceptContactRequest(requestId: number, receiverId: number) {
    const request = await this.contactRequestRepo.findOne({
      where: { id: requestId, receiver: { id: receiverId }, status: 'pending' },
      relations: ['sender', 'receiver'],
    });

    if (!request) {
      throw new HttpException(
        'Request not found or not pending',
        HttpStatus.NOT_FOUND,
      );
    }

    request.status = 'accepted';
    console.log('accepted');
    await this.contactRequestRepo.save(request);

    const sender = request.sender;
    const receiver = request.receiver;

    await this.userRepo
      .createQueryBuilder()
      .relation(User, 'contacts')
      .of(sender)
      .add(receiver);

    await this.userRepo
      .createQueryBuilder()
      .relation(User, 'contacts')
      .of(receiver)
      .add(sender);

    // Emit event for contact accepted
    this.eventEmitter.emit('contact.accepted', {
      senderId: sender.id,
      receiverId: receiver.id,
    });

    return { message: 'Request accepted' };
  }

  async rejectContactRequest(requestId: number, receiverId: number) {
    const request = await this.contactRequestRepo.findOne({
      where: { id: requestId, receiver: { id: receiverId }, status: 'pending' },
    });

    if (!request) {
      throw new HttpException(
        'Request not found or not pending',
        HttpStatus.NOT_FOUND,
      );
    }

    request.status = 'rejected';
    await this.contactRequestRepo.save(request);

    return { message: 'Request rejected' };
  }

  async getContacts(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['contacts'],
      select: {
        contacts: { id: true, username: true, email: true, profileImage: true },
      },
    });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user.contacts;
  }

  async areContacts(userId1: number, userId2: number) {
    const count = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.contacts', 'contact')
      .where('user.id = :userId1', { userId1 })
      .andWhere('contact.id = :userId2', { userId2 })
      .getCount();
    return count > 0;
  }
}
