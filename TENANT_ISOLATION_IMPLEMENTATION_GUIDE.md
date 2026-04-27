# Tenant Isolation Fix - Implementation Guide

## Quick Overview

This document provides step-by-step instructions to fix cross-tenant data leaks in the application.

**Estimated Implementation Time**: 4-6 hours  
**Risk Level**: CRITICAL (must fix immediately)  
**Rollback Time**: 15-30 minutes

---

## Step 1: Code Changes - Medical Records Controller

**File**: `src/medical-records/controllers/medical-records.controller.ts`

### 1.1 Import CurrentTenant decorator if not present

```typescript
import { CurrentTenant } from '@/tenant';
```

### 1.2 Update getTimeline method

**BEFORE:**
```typescript
@Get('timeline/:patientId')
@ApiOperation({ summary: 'Get medical history timeline for a patient' })
@ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
async getTimeline(@Param('patientId') patientId: string, @Query('limit') limit?: number) {
  return this.medicalRecordsService.getTimeline(patientId, limit || 50);
}
```

**AFTER:**
```typescript
@Get('timeline/:patientId')
@ApiOperation({ summary: 'Get medical history timeline for a patient' })
@ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
async getTimeline(
  @Param('patientId') patientId: string,
  @Query('limit') limit?: number,
  @CurrentTenant('tenantId') tenantId: string,
) {
  return this.medicalRecordsService.getTimeline(patientId, limit || 50, tenantId);
}
```

### 1.3 Update getVersions method

**BEFORE:**
```typescript
@Get(':id/versions')
@ApiOperation({ summary: 'Get version history for a medical record' })
@ApiResponse({ status: 200, description: 'Version history retrieved successfully' })
async getVersions(@Param('id') id: string) {
  return this.medicalRecordsService.getVersions(id);
}
```

**AFTER:**
```typescript
@Get(':id/versions')
@ApiOperation({ summary: 'Get version history for a medical record' })
@ApiResponse({ status: 200, description: 'Version history retrieved successfully' })
async getVersions(@Param('id') id: string, @CurrentTenant('tenantId') tenantId: string) {
  return this.medicalRecordsService.getVersions(id, tenantId);
}
```

### 1.4 Update update method

**BEFORE:**
```typescript
@Put(':id')
@ApiOperation({ summary: 'Update a medical record' })
@ApiResponse({ status: 200, description: 'Medical record updated successfully' })
@ApiResponse({ status: 404, description: 'Medical record not found' })
@ApiResponse({ status: 409, description: 'Version conflict' })
async update(
  @Param('id') id: string,
  @Body() updateDto: UpdateMedicalRecordDto,
  @CurrentUser() user: any,
  @Query('changeReason') changeReason?: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  const userName = user?.email || 'System';
  return this.medicalRecordsService.update(id, updateDto, userId, userName, changeReason);
}
```

**AFTER:**
```typescript
@Put(':id')
@ApiOperation({ summary: 'Update a medical record' })
@ApiResponse({ status: 200, description: 'Medical record updated successfully' })
@ApiResponse({ status: 404, description: 'Medical record not found' })
@ApiResponse({ status: 409, description: 'Version conflict' })
async update(
  @Param('id') id: string,
  @Body() updateDto: UpdateMedicalRecordDto,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,
  @Query('changeReason') changeReason?: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  const userName = user?.email || 'System';
  return this.medicalRecordsService.update(id, updateDto, userId, userName, changeReason, tenantId);
}
```

### 1.5 Update archive method

**BEFORE:**
```typescript
@Put(':id/archive')
@ApiOperation({ summary: 'Archive a medical record' })
@ApiResponse({ status: 200, description: 'Medical record archived successfully' })
async archive(@Param('id') id: string, @CurrentUser() user: any) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.archive(id, userId, user?.email);
}
```

**AFTER:**
```typescript
@Put(':id/archive')
@ApiOperation({ summary: 'Archive a medical record' })
@ApiResponse({ status: 200, description: 'Medical record archived successfully' })
async archive(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.archive(id, userId, user?.email, tenantId);
}
```

### 1.6 Update restore method

**BEFORE:**
```typescript
@Put(':id/restore')
@ApiOperation({ summary: 'Restore an archived medical record' })
@ApiResponse({ status: 200, description: 'Medical record restored successfully' })
async restore(@Param('id') id: string, @CurrentUser() user: any) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.restore(id, userId, user?.email);
}
```

**AFTER:**
```typescript
@Put(':id/restore')
@ApiOperation({ summary: 'Restore an archived medical record' })
@ApiResponse({ status: 200, description: 'Medical record restored successfully' })
async restore(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  return this.medicalRecordsService.restore(id, userId, user?.email, tenantId);
}
```

### 1.7 Update delete method

**BEFORE:**
```typescript
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: 'Delete a medical record (soft delete)' })
@ApiResponse({ status: 204, description: 'Medical record deleted successfully' })
async delete(@Param('id') id: string, @CurrentUser() user: any) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  await this.medicalRecordsService.delete(id, userId, user?.email);
}
```

**AFTER:**
```typescript
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: 'Delete a medical record (soft delete)' })
@ApiResponse({ status: 204, description: 'Medical record deleted successfully' })
async delete(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @CurrentTenant('tenantId') tenantId: string,
) {
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  await this.medicalRecordsService.delete(id, userId, user?.email, tenantId);
}
```

---

## Step 2: Code Changes - Medical Records Service

**File**: `src/medical-records/services/medical-records.service.ts`

### 2.1 Import ForbiddenException

```typescript
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
```

### 2.2 Update getTimeline method

**BEFORE:**
```typescript
async getTimeline(patientId: string, limit: number = 50): Promise<MedicalHistory[]> {
  return this.historyRepository.find({
    where: { patientId },
    order: { eventDate: 'DESC' },
    take: limit,
  });
}
```

**AFTER:**
```typescript
async getTimeline(
  patientId: string,
  limit: number = 50,
  organizationId?: string,
): Promise<MedicalHistory[]> {
  if (!organizationId) {
    throw new BadRequestException('Organization ID is required');
  }

  return this.historyRepository.find({
    where: {
      patientId,
      organizationId, // ← ADD TENANT FILTER
    },
    order: { eventDate: 'DESC' },
    take: limit,
  });
}
```

### 2.3 Update getVersions method

**BEFORE:**
```typescript
async getVersions(recordId: string): Promise<MedicalRecordVersion[]> {
  return this.versionRepository.find({
    where: { medicalRecordId: recordId },
    order: { versionNumber: 'DESC' },
  });
}
```

**AFTER:**
```typescript
async getVersions(recordId: string, organizationId?: string): Promise<MedicalRecordVersion[]> {
  if (!organizationId) {
    throw new BadRequestException('Organization ID is required');
  }

  // Verify the record exists and belongs to this organization
  const record = await this.medicalRecordRepository.findOne({
    where: {
      id: recordId,
      organizationId,
    },
  });

  if (!record) {
    throw new NotFoundException('Medical record not found');
  }

  return this.versionRepository.find({
    where: {
      medicalRecordId: recordId,
      organizationId, // ← ADD TENANT FILTER
    },
    order: { versionNumber: 'DESC' },
  });
}
```

### 2.4 Update update method

**BEFORE:**
```typescript
async update(
  id: string,
  updateDto: UpdateMedicalRecordDto,
  userId: string,
  userName?: string,
  changeReason?: string,
): Promise<MedicalRecord> {
  const record = await this.findOne(id);
  // ... rest of logic
}
```

**AFTER:**
```typescript
async update(
  id: string,
  updateDto: UpdateMedicalRecordDto,
  userId: string,
  userName?: string,
  changeReason?: string,
  organizationId?: string,
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);

  // Verify ownership
  if (organizationId && record.organizationId !== organizationId) {
    this.logSecurityEvent('TENANT_VALIDATION_FAILED', userId, organizationId, id, {
      reason: 'Record belongs to different organization',
    });
    throw new ForbiddenException('Cannot access record from another organization');
  }

  if (record.status === MedicalRecordStatus.DELETED) {
    throw new BadRequestException('Cannot update a deleted record');
  }

  // ... rest of logic
}
```

### 2.5 Update archive method

Add `organizationId` parameter and verification:

```typescript
async archive(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);

  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot modify record from another organization');
  }

  // ... rest of logic
}
```

### 2.6 Update restore method

Add `organizationId` parameter and verification:

```typescript
async restore(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,
): Promise<MedicalRecord> {
  const record = await this.findOne(id, undefined, organizationId);

  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot modify record from another organization');
  }

  // ... rest of logic
}
```

### 2.7 Update delete method

Add `organizationId` parameter and verification:

```typescript
async delete(
  id: string,
  userId: string,
  userName?: string,
  organizationId?: string,
): Promise<void> {
  const record = await this.findOne(id, undefined, organizationId);

  if (organizationId && record.organizationId !== organizationId) {
    throw new ForbiddenException('Cannot delete record from another organization');
  }

  // ... rest of logic
}
```

### 2.8 Add security logging method

```typescript
private logSecurityEvent(
  eventType: 'CROSS_TENANT_ATTEMPT' | 'TENANT_VALIDATION_FAILED',
  userId: string,
  organizationId: string,
  recordId: string,
  details: any,
) {
  this.logger.warn(
    `⚠️ SECURITY: ${eventType} - User: ${userId}, Org: ${organizationId}, Record: ${recordId}`,
    {
      event: eventType,
      userId,
      organizationId,
      recordId,
      details,
      timestamp: new Date().toISOString(),
    },
  );
  
  // TODO: Send to security event log/SIEM system
  // metrics.increment('security.cross_tenant_attempt', { organizationId });
}
```

---

## Step 3: Database Migrations

Create migration file: `src/database/migrations/[timestamp]-add-tenant-isolation.ts`

Run this migration to add the required columns and constraints.

---

## Step 4: Entity Updates

### 4.1 Update MedicalHistory Entity

Add `organizationId` column:

```typescript
@Column({ type: 'uuid' })
@Index()
organizationId: string;
```

### 4.2 Update MedicalRecordVersion Entity

Add `organizationId` column:

```typescript
@Column({ type: 'uuid' })
@Index()
organizationId: string;
```

---

## Step 5: Testing

### 5.1 Unit Tests

```bash
npm run test -- test/security/cross-tenant-data-leak.spec.ts
```

### 5.2 Integration Tests

```bash
npm run test:e2e -- test/e2e/medical-records.e2e-spec.ts
```

### 5.3 Security Test Cases

Run the security test suite to verify:
- ✅ Timeline access is tenant-filtered
- ✅ Version history is tenant-filtered
- ✅ Updates are rejected from other tenants
- ✅ Deletes are rejected from other tenants
- ✅ Archives are rejected from other tenants

---

## Step 6: Deployment

### 6.1 Pre-Deployment Checklist

- [ ] Code review completed (2+ reviewers)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Security tests passing
- [ ] Database backups taken
- [ ] Migration tested in staging environment
- [ ] Rollback plan prepared
- [ ] On-call engineer assigned

### 6.2 Deployment Steps

1. **Create feature flag** (optional but recommended):
   ```typescript
   // Enable/disable tenant isolation validation
   const STRICT_TENANT_ENFORCEMENT = process.env.STRICT_TENANT_ENFORCEMENT === 'true';
   ```

2. **Deploy code changes**:
   ```bash
   git checkout -b fix/cross-tenant-data-leak
   git commit -m "fix: enforce tenant isolation in medical records access"
   git push origin fix/cross-tenant-data-leak
   ```

3. **Run database migration** (staging first):
   ```bash
   npm run typeorm migration:run
   ```

4. **Deploy to production**:
   ```bash
   # During low-traffic window
   npm run deploy
   ```

5. **Monitor logs** for security events:
   ```bash
   # Watch for CROSS_TENANT_ATTEMPT or TENANT_VALIDATION_FAILED
   tail -f logs/security.log | grep -E "CROSS_TENANT|TENANT_VALIDATION"
   ```

### 6.3 Rollback Plan

If issues occur:

```bash
# Revert code changes
git revert [commit-hash]

# Revert database migration
npm run typeorm migration:revert
```

---

## Step 7: Verification

### 7.1 Functional Verification

```bash
# Test timeline access is tenant-filtered
curl -X GET "http://localhost:3000/medical-records/timeline/patient-123" \
  -H "X-Tenant-ID: org-1" \
  -H "Authorization: Bearer token"

# Should only return events from org-1
```

### 7.2 Security Verification

```bash
# Test cross-tenant access is blocked
curl -X GET "http://localhost:3000/medical-records/timeline/patient-from-org-2" \
  -H "X-Tenant-ID: org-1" \
  -H "Authorization: Bearer token"

# Should return 403 Forbidden
```

### 7.3 Performance Verification

```bash
# Measure query performance with indexes
time npm run test -- --testNamePattern="Performance"

# Should complete in <100ms
```

---

## Step 8: Documentation Updates

- [ ] Update API documentation with tenant filtering behavior
- [ ] Update security guidelines
- [ ] Update incident response procedures
- [ ] Notify security team and compliance
- [ ] Schedule knowledge transfer session

---

## Rollback Procedure

If critical issues are discovered:

```bash
# 1. Revert code
git revert [deployment-commit]
npm run build
npm run deploy

# 2. Revert database (if migration caused issues)
npm run typeorm migration:revert

# 3. Verify rollback
npm run test:security  # Should see BUG behaviors again

# 4. Document incident
incident_report.md
```

---

## Post-Deployment

- [ ] Monitor security logs for 24 hours
- [ ] Check for any "CROSS_TENANT_ATTEMPT" events
- [ ] Verify no legitimate access is blocked (false positives)
- [ ] Performance metrics within 5% of baseline
- [ ] Notify stakeholders of deployment success
- [ ] Schedule security audit for compliance verification

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Code changes | 1-2 hrs | Edit 3 files |
| Testing | 1-2 hrs | Run test suite |
| Database migration | 30 min | Test in staging |
| Code review | 1 hr | 2+ reviewers |
| Deployment | 30 min | Off-peak window |
| Verification | 30 min | Smoke tests |
| **Total** | **4-6 hrs** | |

---

## Support & Questions

- **Security Concerns**: Contact [security team]
- **Technical Issues**: Contact [on-call engineer]
- **Deployment Issues**: Contact [DevOps team]

---

## References

- [Cross-Tenant Data Leak Report](./CROSS_TENANT_DATA_LEAK_SECURITY_REPORT.md)
- [Detailed Fixes](./TENANT_ISOLATION_FIXES.md)
- [Security Tests](./test/security/cross-tenant-data-leak.spec.ts)
