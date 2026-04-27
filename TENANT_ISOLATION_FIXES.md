# Tenant Isolation Security Fixes

This document contains corrected code for critical cross-tenant data leak vulnerabilities.

## Fix 1: Medical Records Controller - Add Tenant Extraction

**File**: `src/medical-records/controllers/medical-records.controller.ts`

### Issues Fixed:
- ✅ Added `@CurrentTenant()` to ALL data access endpoints
- ✅ Pass tenantId to all service methods
- ✅ Validate tenant context before proceeding
- ✅ Add security validations

### Key Changes:

```typescript
// ✅ getTimeline - ADD tenantId parameter
async getTimeline(
  @Param('patientId') patientId: string,
  @Query('limit') limit?: number,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
) {
  return this.medicalRecordsService.getTimeline(patientId, limit || 50, tenantId);  // ← PASS tenantId
}

// ✅ getVersions - ADD tenantId parameter  
async getVersions(
  @Param('id') id: string,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
) {
  return this.medicalRecordsService.getVersions(id, tenantId);  // ← PASS tenantId
}

// ✅ update - ADD tenantId parameter
async update(
  @Param('id') id: string,
  @Body() updateDto: UpdateMedicalRecordDto,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
  @Query('changeReason') changeReason?: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  const userName = user?.email || 'System';
  return this.medicalRecordsService.update(id, updateDto, userId, userName, changeReason, tenantId);  // ← PASS tenantId
}

// ✅ archive - ADD tenantId parameter
async archive(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.archive(id, userId, user?.email, tenantId);  // ← PASS tenantId
}

// ✅ restore - ADD tenantId parameter
async restore(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.restore(id, userId, user?.email, tenantId);  // ← PASS tenantId
}

// ✅ delete - ADD tenantId parameter
async delete(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,  // ← ADD THIS
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  await this.medicalRecordsService.delete(id, userId, user?.email, tenantId);  // ← PASS tenantId
}
```

---

## Fix 2: Medical Records Service - Add Tenant Validation

**File**: `src/medical-records/services/medical-records.service.ts`

### Issues Fixed:
- ✅ Added organizationId filter to `getTimeline()`
- ✅ Added organizationId filter to `getVersions()`
- ✅ Added organizationId parameter to mutation methods
- ✅ Verify tenant ownership before modifying records
- ✅ Tenant validation on findOne()

### Key Changes:

```typescript
// ✅ FIX: getTimeline - Add organizationId filter
async getTimeline(
  patientId: string,
  limit: number = 50,
  organizationId: string,  // ← ADD THIS PARAMETER
): Promise<MedicalHistory[]> {
  return this.historyRepository.find({
    where: {
      patientId,
      // ✅ ADD TENANT FILTER
      organizationId,  
    },
    order: { eventDate: 'DESC' },
    take: limit,
  });
}

// ✅ FIX: getVersions - Add organizationId filter
async getVersions(
  recordId: string,
  organizationId: string,  // ← ADD THIS PARAMETER
): Promise<MedicalRecordVersion[]> {
  // First verify the record belongs to this organization
  const record = await this.medicalRecordRepository.findOne({
    where: {
      id: recordId,
      organizationId,  // ← VERIFY OWNERSHIP
    },
  });

  if (!record) {
    throw new NotFoundException('Medical record not found');
  }

  return this.versionRepository.find({
    where: {
      medicalRecordId: recordId,
      organizationId,  // ← ADD TENANT FILTER
    },
    order: { versionNumber: 'DESC' },
  });
}

// ✅ FIX: update - Add organizationId parameter and validation
async update(
  id: string,
  updateDto: UpdateMedicalRecordDto,
  userId: string,
  userName?: string,
  changeReason?: string,
  organizationId?: string,  // ← ADD THIS PARAMETER
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);  // ← PASS organizationId

  if (record.status === MedicalRecordStatus.DELETED) {
    throw new BadRequestException('Cannot update a deleted record');
  }

  // Verify ownership before proceeding
  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot access record from another organization');
  }

  // ... rest of update logic
}

// ✅ FIX: archive - Add organizationId parameter and validation
async archive(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,  // ← ADD THIS PARAMETER
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);  // ← PASS organizationId

  // Verify ownership
  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot modify record from another organization');
  }

  return this.dataSource.transaction(async (manager) => {
    record.status = MedicalRecordStatus.ARCHIVED;
    record.updatedBy = userId;

    const archived = await manager.save(MedicalRecord, record);

    await this.createHistoryEntry(
      archived.id,
      archived.patientId,
      HistoryEventType.ARCHIVED,
      'Medical record archived',
      userId,
      userName,
      undefined,
      undefined,
      undefined,
      manager,
    );

    this.logger.log(`Medical record archived: ${id}`);
    return archived;
  });
}

// ✅ FIX: restore - Add organizationId parameter and validation
async restore(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,  // ← ADD THIS PARAMETER
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);  // ← PASS organizationId

  // Verify ownership
  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot modify record from another organization');
  }

  return this.dataSource.transaction(async (manager) => {
    record.status = MedicalRecordStatus.ACTIVE;
    record.updatedBy = userId;

    const restored = await manager.save(MedicalRecord, record);

    await this.createHistoryEntry(
      restored.id,
      restored.patientId,
      HistoryEventType.RESTORED,
      'Medical record restored',
      userId,
      userName,
      undefined,
      undefined,
      undefined,
      manager,
    );

    this.logger.log(`Medical record restored: ${id}`);
    return restored;
  });
}

// ✅ FIX: delete - Add organizationId parameter and validation
async delete(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,  // ← ADD THIS PARAMETER
): Promise<void> {
  const record = await this.findOne(id, undefined, organizationId);  // ← PASS organizationId

  // Verify ownership
  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot delete record from another organization');
  }

  return this.dataSource.transaction(async (manager) => {
    record.status = MedicalRecordStatus.DELETED;
    record.updatedBy = userId;
    record.deletedAt = new Date();

    await manager.save(MedicalRecord, record);

    await this.createHistoryEntry(
      id,
      record.patientId,
      HistoryEventType.DELETED,
      'Medical record deleted',
      userId,
      userName,
      undefined,
      undefined,
      undefined,
      manager,
    );

    this.logger.log(`Medical record soft-deleted: ${id}`);
  });
}
```

---

## Fix 3: MedicalHistory Entity - Add organizationId Column

**File**: `src/medical-records/entities/medical-history.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum HistoryEventType {
  CREATED = 'created',
  UPDATED = 'updated',
  ARCHIVED = 'archived',
  RESTORED = 'restored',
  DELETED = 'deleted',
  VIEWED = 'viewed',
  SHARED = 'shared',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
}

@Entity('medical_history')
@Index(['organizationId', 'patientId', 'eventDate'])  // ← ADD INDEX
@Index(['organizationId', 'medicalRecordId'])  // ← ADD INDEX
export class MedicalHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;  // ← ADD THIS COLUMN - TENANT IDENTIFIER

  @Column({ type: 'uuid' })
  @Index()
  patientId: string;

  @Column({ type: 'uuid', nullable: true })
  medicalRecordId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: HistoryEventType,
  })
  eventType: HistoryEventType;

  @Column()
  description: string;

  @Column({ nullable: true })
  userEmail?: string;

  @CreateDateColumn()
  eventDate: Date;

  // Add constraint: organizationId + patientId + eventDate unique (soft)
}
```

---

## Fix 4: MedicalRecordVersion Entity - Add organizationId Column

**File**: `src/medical-records/entities/medical-record-version.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MedicalRecord } from './medical-record.entity';

@Entity('medical_record_versions')
@Index(['organizationId', 'medicalRecordId', 'versionNumber'])  // ← ADD INDEX
@Index(['organizationId', 'createdAt'])  // ← ADD INDEX
export class MedicalRecordVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;  // ← ADD THIS COLUMN - TENANT IDENTIFIER

  @Column({ type: 'uuid' })
  @Index()
  medicalRecordId: string;

  @ManyToOne(() => MedicalRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicalRecordId' })
  medicalRecord: MedicalRecord;

  @Column({ type: 'int' })
  versionNumber: number;

  @Column({ type: 'text' })
  content: string; // JSON stringified - encrypted

  @Column({ type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  createdByEmail?: string;

  @Column()
  changeReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

---

## Fix 5: Database Migration

**File**: `src/database/migrations/[timestamp]-add-tenant-isolation.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddTenantIsolation[timestamp] implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add organizationId to medical_history
    await queryRunner.addColumn(
      'medical_history',
      new TableColumn({
        name: 'organizationId',
        type: 'uuid',
        isNullable: false,
        default: "'00000000-0000-0000-0000-000000000000'",  // Temporary default for existing rows
      }),
    );

    // Add organizationId to medical_record_versions
    await queryRunner.addColumn(
      'medical_record_versions',
      new TableColumn({
        name: 'organizationId',
        type: 'uuid',
        isNullable: false,
        default: "'00000000-0000-0000-0000-000000000000'",  // Temporary default
      }),
    );

    // Create indexes for tenant isolation
    await queryRunner.createIndex(
      'medical_history',
      new TableIndex({
        name: 'idx_medical_history_organization_patient_event',
        columnNames: ['organizationId', 'patientId', 'eventDate'],
      }),
    );

    await queryRunner.createIndex(
      'medical_record_versions',
      new TableIndex({
        name: 'idx_medical_record_versions_organization_record',
        columnNames: ['organizationId', 'medicalRecordId', 'versionNumber'],
      }),
    );

    // Add foreign key constraint to ensure data integrity
    await queryRunner.query(
      `ALTER TABLE medical_history 
       ADD CONSTRAINT fk_medical_history_organization 
       FOREIGN KEY (organizationId) 
       REFERENCES organizations(id) ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE medical_record_versions 
       ADD CONSTRAINT fk_medical_record_versions_organization 
       FOREIGN KEY (organizationId) 
       REFERENCES organizations(id) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE medical_history 
       DROP CONSTRAINT IF EXISTS fk_medical_history_organization`,
    );

    await queryRunner.query(
      `ALTER TABLE medical_record_versions 
       DROP CONSTRAINT IF EXISTS fk_medical_record_versions_organization`,
    );

    // Drop indexes
    await queryRunner.dropIndex('medical_history', 'idx_medical_history_organization_patient_event');
    await queryRunner.dropIndex('medical_record_versions', 'idx_medical_record_versions_organization_record');

    // Drop columns
    await queryRunner.dropColumn('medical_history', 'organizationId');
    await queryRunner.dropColumn('medical_record_versions', 'organizationId');
  }
}
```

---

## Fix 6: Update createHistoryEntry Method

**File**: `src/medical-records/services/medical-records.service.ts`

```typescript
// ✅ FIX: createHistoryEntry - Add organizationId parameter
private async createHistoryEntry(
  recordId: string,
  patientId: string,
  eventType: HistoryEventType,
  description: string,
  userId: string,
  userName?: string,
  organizationId?: string,  // ← ADD THIS PARAMETER
  createdBy?: any,
  manager?: EntityManager,
): Promise<void> {
  const historyEntry = {
    recordId,
    patientId,
    medicalRecordId: recordId,
    eventType,
    description,
    userId,
    userEmail: userName,
    organizationId,  // ← USE THIS
    eventDate: new Date(),
  };

  const repo = manager ? manager.getRepository(MedicalHistory) : this.historyRepository;
  await repo.save(historyEntry);
}
```

---

## Fix 7: Audit Logging with Tenant Context

**File**: `src/medical-records/services/medical-records.service.ts`

```typescript
// ✅ Add security audit for attempted cross-tenant access
private logSecurityEvent(
  eventType: 'CROSS_TENANT_ATTEMPT' | 'TENANT_VALIDATION_FAILED',
  userId: string,
  tenantId: string,
  recordId: string,
  details: any,
) {
  this.logger.warn(
    {
      event: eventType,
      userId,
      attemptedTenant: tenantId,
      recordId,
      details,
      timestamp: new Date().toISOString(),
    },
    `Security: ${eventType}`,
  );
  // TODO: Send to security event log/SIEM
}
```

---

## Testing Checklist

### Unit Tests

```typescript
// ✅ Test tenant isolation in getTimeline
describe('getTimeline with tenant isolation', () => {
  it('should return timeline only for records in the same organization', async () => {
    const patientId = 'patient-1';
    const orgId1 = 'org-1';
    const orgId2 = 'org-2';

    // Create timeline entry for org1
    await historyRepo.save({
      organizationId: orgId1,
      patientId,
      eventType: HistoryEventType.CREATED,
    });

    // Create timeline entry for org2
    await historyRepo.save({
      organizationId: orgId2,
      patientId,
      eventType: HistoryEventType.UPDATED,
    });

    // Query as org1
    const result = await service.getTimeline(patientId, 50, orgId1);
    
    // Should only get org1's entry
    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe(orgId1);
  });
});
```

### Integration Tests

```typescript
// ✅ Test cross-tenant access prevention
describe('Cross-tenant access prevention', () => {
  it('should reject getTimeline request with wrong organization', async () => {
    const result = await request(app.getHttpServer())
      .get(`/medical-records/timeline/${patientId}`)
      .set('X-Tenant-ID', wrongOrganizationId)
      .expect(403);
  });
})
```

---

## Deployment Checklist

- [ ] Code reviews completed
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Migration script tested in staging
- [ ] Database backups taken
- [ ] Feature flag to enable new validation logic
- [ ] Monitoring/alerting for cross-org access attempts
- [ ] Security audit log enabled
- [ ] Documentation updated
- [ ] Team trained on changes
- [ ] Rollback plan ready
- [ ] Deployed to production
- [ ] Post-deployment verification completed

---

## Monitoring & Alerts

```typescript
// Add alerts for suspicious activity
if (organizationId && record.organizationId !== organizationId) {
  metrics.increment('security.cross_tenant_attempt', {
    attemptedOrg: organizationId,
    actualOrg: record.organizationId,
    userId,
  });
  
  // Alert to security team
  alerting.sendAlert({
    severity: 'CRITICAL',
    title: 'Cross-tenant access attempt',
    details: { attemptedOrg: organizationId, recordId: id, userId },
  });
}
```

---

## References

- OWASP: Broken Access Control
- CWE-639: Authorization Bypass Through User-Controlled Key
- HIPAA Security Rule 45 CFR 164.312(a)(2)(i)
