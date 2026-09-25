import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export type ReprocessPolicyApprovalDocument = HydratedDocument<ReprocessPolicyApprovalRecord>;

@Schema({ collection: 'reprocess_policy_approvals', timestamps: true })
export class ReprocessPolicyApprovalRecord {
  @ApiProperty({ example: 'RPA-20260924T185501Z' })
  @Prop({ type: String, required: true, unique: true })
  version: string;

  @ApiPropertyOptional({ example: 'APRV-FISCAL-2026-0091' })
  @Prop({ type: String })
  approvalTicket?: string;

  @ApiPropertyOptional({ example: 'lider.fiscal@empresa.com' })
  @Prop({ type: String })
  approvedBy?: string;

  @ApiProperty({ type: [String], example: ['99', '90'] })
  @Prop({ type: [String], default: [] })
  blockedStatusCodes: string[];

  @ApiProperty({ type: [String], example: ['FAD', 'CAD'] })
  @Prop({ type: [String], default: [] })
  blockedRulePrefixes: string[];

  @ApiProperty({ type: Number, example: 5 })
  @Prop({ type: Number, required: true })
  statusMinOccurrences: number;

  @ApiProperty({ type: Number, example: 8 })
  @Prop({ type: Number, required: true })
  rulePrefixMinOccurrences: number;

  @ApiProperty({ type: Number, example: 3 })
  @Prop({ type: Number, required: true })
  rulePrefixLength: number;

  @ApiProperty({ type: Number, example: 200 })
  @Prop({ type: Number, required: true })
  sampleLimit: number;

  @ApiProperty({ type: [String] })
  @Prop({ type: [String], default: [] })
  envSnippet: string[];

  @ApiProperty({ type: [Object], additionalProperties: true })
  @Prop({ type: [Object], default: [] })
  sampledTopStatusCodes: Array<{ code: string; count: number }>;

  @ApiProperty({ type: [Object], additionalProperties: true })
  @Prop({ type: [Object], default: [] })
  sampledTopRuleCodes: Array<{ code: string; count: number }>;

  @ApiProperty({ type: Number, example: 34 })
  @Prop({ type: Number, required: true })
  totalRejectedInvoices: number;

  @ApiPropertyOptional({ example: 'Aprobacion en comite operativo DIAN 2026-09' })
  @Prop({ type: String })
  notes?: string;

  @ApiPropertyOptional({ example: 'POS_WEB' })
  @Prop({ type: String })
  requestSource?: string;

  @ApiPropertyOptional({ example: 'usuario@empresa.com' })
  @Prop({ type: String })
  requestUser?: string;

  @ApiProperty({ example: '2026-09-24T18:55:01.000Z' })
  @Prop({ type: Date, required: true })
  approvedAt: Date;

  @ApiPropertyOptional({ type: [Object] })
  @Prop({ type: [Object], default: [] })
  deployments?: Array<{
    environment: string;
    deployedAt: Date;
    deployedBy?: string;
    changeTicket?: string;
    requestSource?: string;
    requestUser?: string;
    envSnippet: string[];
    notes?: string;
  }>;
}

export const ReprocessPolicyApprovalSchema =
  SchemaFactory.createForClass(ReprocessPolicyApprovalRecord);

ReprocessPolicyApprovalSchema.index({ approvedAt: -1 });
