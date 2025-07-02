import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { ChatService } from './chat.service';
import { ContactService } from 'src/contact/contact.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entity/user.entity';
import { OnEvent } from '@nestjs/event-emitter';
import { ContactRequest } from 'src/contact/entity/contact-request.entity';
import { JwtService } from '@nestjs/jwt';

interface ConnectedUser {
  userId: number;
  username: string;
  socketId: string;
}

type SavedMessage = {
  id: number;
  message: string;
  status: 'sent' | 'delivered' | 'seen';
  createdAt: Date;
  updatedAt: Date;
  sender: { id: number; username: string };
  receiver: { id: number; username: string };
};

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // Simple user tracking: userId -> socketId
  private connectedUsers: Map<string, ConnectedUser> = new Map(); // socketId -> user
  private userSockets = new Map<number, string>(); // userId -> socketId

  constructor(
    private chatService: ChatService,
    private contactService: ContactService,
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      console.log(`Client connecting: ${client.id}`);
      // Get token from auth or query
      const token =
        client.handshake.auth?.token || client.handshake.query?.token;

      if (!token) {
        console.log('No token provided, disconnecting');
        client.disconnect();
        return;
      }

      // Verify JWT
      const decoded = this.jwtService.decode(token);
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        (!('sub' in decoded) && !('userId' in decoded))
      ) {
        console.log('Invalid token, disconnecting');
        client.disconnect();
        return;
      }

      // Get user
      const user = await this.userRepo.findOne({
        where: {
          id:
            (decoded as { sub?: number; userId?: number }).sub ||
            (decoded as { userId?: number }).userId,
        },
        select: ['id', 'username'],
      });

      if (!user) {
        console.log('User not found, disconnecting');
        client.disconnect();
        return;
      }

      // If user already connected, disconnect old connection
      const existingSocketId = this.userSockets.get(user.id);
      if (existingSocketId && this.connectedUsers.has(existingSocketId)) {
        console.log(`Disconnecting old connection for user ${user.username}`);
        const oldSocket = this.server.sockets.sockets.get(existingSocketId);
        if (oldSocket) {
          oldSocket.disconnect();
        }
        this.connectedUsers.delete(existingSocketId);
      }

      // Store new connection
      this.connectedUsers.set(client.id, {
        userId: user.id,
        username: user.username,
        socketId: client.id,
      });
      this.userSockets.set(user.id, client.id);

      console.log(
        `User ${user.username} connected successfully (socket: ${client.id})`,
      );

      // Confirm connection to client
      client.emit('connected', {
        success: true,
        userId: user.id,
        username: user.username,
      });
      console.log(`Emitted 'connected' event to socket: ${client.id}`);
    } catch (err) {
      console.error('Connection error:', err);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    const user = this.connectedUsers.get(client.id);
    if (user) {
      this.connectedUsers.delete(client.id);
      this.userSockets.delete(user.userId);
      console.log(`User ${user.username} disconnected (socket: ${client.id})`);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      receiverUsername: string;
      message: string;
    },
  ) {
    try {
      const sender = this.connectedUsers.get(client.id);
      if (
        !sender ||
        typeof sender.userId !== 'number' ||
        typeof sender.username !== 'string'
      ) {
        client.emit('error', { message: 'Not authenticated' });
        return;
      }
      // Find receiver
      const receiverUsername: string = String(payload.receiverUsername);
      const receiver = await this.userRepo.findOne({
        where: { username: receiverUsername },
        select: ['id', 'username'],
      });
      if (!receiver) {
        client.emit('error', { message: 'Receiver not found' });
        return;
      }
      // Check if they are contacts
      const areContacts = await this.contactService.areContacts(
        sender.userId,
        receiver.id,
      );
      if (!areContacts) {
        client.emit('error', { message: 'Users are not contacts' });
        return;
      }
      // Save message to database
      const savedMessageRaw = await this.chatService.saveMessage(
        sender.username,
        String(payload.receiverUsername),
        payload.message,
      );
      if (
        !savedMessageRaw ||
        typeof savedMessageRaw.id !== 'number' ||
        typeof savedMessageRaw.message !== 'string' ||
        typeof savedMessageRaw.status !== 'string' ||
        !(savedMessageRaw.createdAt instanceof Date) ||
        !(savedMessageRaw.updatedAt instanceof Date) ||
        !savedMessageRaw.sender ||
        typeof savedMessageRaw.sender.id !== 'number' ||
        typeof savedMessageRaw.sender.username !== 'string' ||
        !savedMessageRaw.receiver ||
        typeof savedMessageRaw.receiver.id !== 'number' ||
        typeof savedMessageRaw.receiver.username !== 'string'
      ) {
        client.emit('error', { message: 'Failed to save message' });
        return;
      }
      const savedMessage: SavedMessage = savedMessageRaw;
      // Get receiver's socket
      const receiverSocketId = this.userSockets.get(receiver.id);
      // Prepare message data
      const messageData = {
        id: savedMessage.id,
        message: savedMessage.message,
        sender: {
          id: sender.userId,
          username: sender.username,
        },
        receiver: {
          id: receiver.id,
          username: receiver.username,
        },
        status: 'sent',
        createdAt: savedMessage.createdAt,
        timestamp: new Date(),
      };
      // If receiver is online, send message instantly
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('new_message', {
          ...messageData,
        });
        console.log(
          `Emitted 'new_message' to receiver (${receiver.username}, socket: ${receiverSocketId}):`,
          messageData,
        );
      }
      // Confirm to sender
      client.emit('message_sent', {
        messageId: savedMessage.id,
        status: 'sent',
        timestamp: new Date(),
      });
      console.log(
        `Emitted 'message_sent' to sender (${sender.username}, socket: ${client.id}):`,
        {
          messageId: savedMessage.id,
          status: 'sent',
          timestamp: new Date(),
        },
      );
    } catch (err) {
      console.error('Send message error:', err);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  // Event handlers for message edits/deletes
  @OnEvent('message_edited')
  handleMessageEdited(payload: {
    messageId: number;
    senderId: number;
    receiverId: number;
    newMessage: string;
  }) {
    const senderSocketId = this.userSockets.get(payload.senderId);
    const receiverSocketId = this.userSockets.get(payload.receiverId);
    const editData = {
      messageId: payload.messageId,
      newMessage: payload.newMessage,
      editedAt: new Date(),
    };
    // Notify both users instantly
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('message_edited', editData);
      console.log(
        `Emitted 'message_edited' to sender (socket: ${senderSocketId}):`,
        editData,
      );
    }
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('message_edited', editData);
      console.log(
        `Emitted 'message_edited' to receiver (socket: ${receiverSocketId}):`,
        editData,
      );
    }
  }

  @OnEvent('message_deleted')
  handleMessageDeleted(payload: {
    messageId: number;
    senderId: number;
    receiverId: number;
  }) {
    const senderSocketId = this.userSockets.get(payload.senderId);
    const receiverSocketId = this.userSockets.get(payload.receiverId);
    const deleteData = {
      messageId: payload.messageId,
      deletedAt: new Date(),
    };
    // Notify both users instantly
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('message_deleted', deleteData);
      console.log(
        `Emitted 'message_deleted' to sender (socket: ${senderSocketId}):`,
        deleteData,
      );
    }
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('message_deleted', deleteData);
      console.log(
        `Emitted 'message_deleted' to receiver (socket: ${receiverSocketId}):`,
        deleteData,
      );
    }
  }

  @OnEvent('contact.request.sent')
  handleContactRequestSent(payload: { request: ContactRequest }) {
    const receiverSocketId = this.userSockets.get(payload.request.receiver.id);
    if (receiverSocketId) {
      this.server
        .to(receiverSocketId)
        .emit('new_contact_request', payload.request);
    }
  }

  @OnEvent('contact.accepted')
  async handleContactAccepted(payload: {
    senderId: number;
    receiverId: number;
  }) {
    const senderSocketId = this.userSockets.get(payload.senderId);
    const receiverSocketId = this.userSockets.get(payload.receiverId);
    if (senderSocketId) {
      await Promise.resolve(
        this.server.to(senderSocketId).emit('contacts_updated'),
      );
    }
    if (receiverSocketId) {
      await Promise.resolve(
        this.server.to(receiverSocketId).emit('contacts_updated'),
      );
    }
  }

  // Helper method to check if user is online
  isUserOnline(userId: number): boolean {
    return this.userSockets.has(userId);
  }

  // Get online users count (for debugging)
  getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Emit a new message to both sender and receiver
  public emitNewMessage(message: {
    id: number;
    message: string;
    sender: { id: number; username: string };
    receiver: { id: number; username: string };
    status: string;
    createdAt: Date;
    timestamp: Date;
  }) {
    const senderSocketId = this.userSockets.get(message.sender.id);
    const receiverSocketId = this.userSockets.get(message.receiver.id);
    if (senderSocketId) {
      this.server.to(senderSocketId).emit('new_message', message);
      console.log(
        `Emitted 'new_message' to sender (socket: ${senderSocketId}):`,
        message,
      );
    }
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('new_message', message);
      console.log(
        `Emitted 'new_message' to receiver (socket: ${receiverSocketId}):`,
        message,
      );
    }
  }
}
