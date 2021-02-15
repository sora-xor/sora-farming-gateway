import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Info extends Document {
  @Prop({ required: true, default: 1 })
  status: number;

  @Prop({ required: true, default: '0' })
  pswap: string;

  @Prop({ required: true, default: 0 })
  startBlock: number;

  @Prop({ required: true, default: 0 })
  lastBlock: number;

  @Prop({ required: true, default: 0 })
  formulaUpdateBlock: number;

  @Prop({ required: true, default: new Date().toISOString() })
  lastUpdateTimestamp: string;
}

export const InfoSchema = SchemaFactory.createForClass(Info);
