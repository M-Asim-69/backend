import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entity/user.entity';
import { ContactService } from '../contact/contact.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private contactService: ContactService,
  ) {}

  async searchUsers(query: string, currentUserId: number) {
    // Get the current user's contacts
    const contacts = await this.contactService.getContacts(currentUserId);
    const contactIds = contacts.map((contact) => contact.id);
    // Exclude current user and their contacts from search
    return this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email', 'user.profileImage'])
      .where('user.username LIKE :query', { query: `%${query}%` })
      .andWhere('user.id != :currentUserId', { currentUserId })
      .andWhere(
        contactIds.length > 0 ? 'user.id NOT IN (:...contactIds)' : '1=1',
        { contactIds },
      )
      .getMany();
  }

  // Other existing methods (e.g., findByUsername, createUser) can remain here
}
