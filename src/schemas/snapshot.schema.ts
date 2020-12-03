import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class LiquiditySnapshot extends Document {
  @Prop({ required: true, default: 0 })
  block: number;

  @Prop({ required: true, default: '0' })
  liquidityUSD: string;
}

export const LiquiditySnapshotSchema = SchemaFactory.createForClass(
  LiquiditySnapshot,
);
