import type { User } from "@prisma/client";
import type { AuthPublicUserDto } from "./auth.types.js";

type UserPublicFields = Pick<User, "id" | "name" | "username" | "email">;

export function toAuthPublicUserDto(
  user: UserPublicFields,
  options?: { usernameOverride?: string; hasReferral?: boolean; energyBlocked?: boolean; energyUnpaidDays?: number },
): AuthPublicUserDto {
  const dto: AuthPublicUserDto = {
    id: user.id,
    name: user.name,
    username: options?.usernameOverride ?? user.username,
    email: user.email,
  };
  if (options?.hasReferral !== undefined) dto.hasReferral = options.hasReferral;
  if (options?.energyBlocked !== undefined) dto.energyBlocked = options.energyBlocked;
  if (options?.energyUnpaidDays !== undefined) dto.energyUnpaidDays = options.energyUnpaidDays;
  return dto;
}
