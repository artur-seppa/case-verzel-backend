import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { User } from '../../../domain/entities/user';
import { UserRole } from '../../../domain/enums';

@Entity('users')
export class UserEntity implements User {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column('varchar', { length: 255 })
  name: string;

  @Column('varchar', { length: 255, unique: true })
  email: string;

  @Column('varchar', { length: 255 })
  passwordHash: string;

  @Column('enum', { enum: UserRole })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
