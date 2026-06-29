import { z } from "zod";

export const createAgreementSchema = z.object({
  payer: z.string().min(1),
  provider: z.string().min(1),
  settlement_asset: z.string().min(1),
  platform: z.string().optional(),
  milestones: z
    .array(
      z.object({
        amount: z.coerce.number().positive(),
        delivery_deadline: z.coerce.number().int().positive(),
        review_deadline: z.coerce.number().int().positive(),
        keeper_bounty: z.coerce.number().int().min(0).default(0),
        splits: z
          .array(
            z.object({
              recipient: z.string().min(1),
              bps: z.number().int().min(0).max(10000),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(5),
});

export const webhookRegisterSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  events_filter: z.array(z.string()).optional(),
});

export const soroswapQuoteSchema = z.object({
  inputAsset: z.string().min(1),
  settlementAsset: z.string().min(1),
  amount: z.string().min(1),
});
