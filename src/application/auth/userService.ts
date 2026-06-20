import { ConflictError } from '../../domain/errors.js';
import type { Role } from '../../domain/roles.js';
import type { PasswordHasher, UserRecord, UserRepository } from './ports.js';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async createUser(input: { email: string; password: string; role: Role }): Promise<UserRecord> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }
    const passwordHash = await this.hasher.hash(input.password);
    return this.users.create({ email: input.email, passwordHash, role: input.role });
  }

  list(): Promise<UserRecord[]> {
    return this.users.list();
  }
}
