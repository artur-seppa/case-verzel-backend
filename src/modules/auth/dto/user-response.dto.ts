import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../shared/domain/enums';

export const userResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(UserRole),
});

export class UserResponseDto extends createZodDto(userResponseSchema) {}
