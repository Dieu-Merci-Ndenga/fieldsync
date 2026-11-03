import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('inspections')
export class Inspection {
  @PrimaryColumn('uuid') id: string;
  @Column('jsonb', { default: {} }) fields: Record<string, unknown>;
  @Column('int', { default: 0 }) version: number;
  @Column('varchar') updatedBy: string;
  @Column('timestamptz', { default: () => 'now()' }) updatedAt: Date;
}

/** Append-only history; its id doubles as the pull cursor. */
@Entity('change_log')
export class ChangeLog {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Index() @Column('uuid') inspectionId: string;
  @Column('int') version: number;
  @Column('varchar') userId: string;
  @Column('jsonb') changes: Record<string, unknown>;
  @Column('varchar', { nullable: true }) opId: string | null;
  @Column('boolean', { default: false }) merged: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/** Idempotency: replaying an operation after a network failure returns the stored result. */
@Entity('processed_ops')
export class ProcessedOp {
  @PrimaryColumn('varchar') opId: string;
  @Column('jsonb') result: Record<string, unknown>;
}

@Entity('photos')
export class Photo {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') inspectionId: string;
  @Column('varchar') mime: string;
  @Column('varchar') path: string;
  @Column('varchar') uploadedBy: string;
}
