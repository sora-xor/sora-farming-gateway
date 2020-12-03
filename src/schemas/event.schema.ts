import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Event extends Document {
  @Prop()
  block: number;

  @Prop(
    raw({
      id: { type: String },
    }),
  )
  user: Record<string, any>;

  @Prop()
  token0PriceUSD: string;
  @Prop()
  liquidityTokenBalance: string;
  @Prop()
  liquidityTokenTotalSupply: string;
  @Prop()
  reserveUSD: string;
  @Prop()
  reserve0: string;
  @Prop()
  reserve1: string;
}

export const EventSchema = SchemaFactory.createForClass(Event);
