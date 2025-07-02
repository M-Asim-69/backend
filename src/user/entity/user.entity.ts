import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Chat } from 'src/chat/entity/chat.entity';
import { ContactRequest } from 'src/contact/entity/contact-request.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  refreshToken: string;

  @OneToMany(() => Chat, (chat) => chat.sender)
  sentMessages: Chat[];

  @OneToMany(() => Chat, (chat) => chat.receiver)
  receivedMessages: Chat[];

  @OneToMany(() => ContactRequest, (request) => request.sender)
  sentContactRequests: ContactRequest[];

  @OneToMany(() => ContactRequest, (request) => request.receiver)
  receivedContactRequests: ContactRequest[];

  @ManyToMany(() => User)
  @JoinTable()
  contacts: User[];
}
