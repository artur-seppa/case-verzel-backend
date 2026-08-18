import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../shared/domain/enums';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
  role: z.enum([UserRole.CLIENT, UserRole.ORGANIZER]),
});

export class RegisterDto extends createZodDto(registerSchema) {}
