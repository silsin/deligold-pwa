import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint!: string;

  @IsObject()
  keys!: { p256dh: string; auth: string };
}

export class UnsubscribeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  endpoint!: string;
}
