import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class User extends Document {
  @Prop({ required: true })
  address: string;

  @Prop({ required: true, default: 0 })
  lastBlock: number;

  @Prop({ required: true, default: '0' })
  reward: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
