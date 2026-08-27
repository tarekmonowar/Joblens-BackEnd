import { Role, User } from "@prisma/client";

export interface IUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
}

export const toUserDto = (user: User): IUserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt.toISOString(),
});
