import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportGenerationService } from '../services/report-generation.service';
import { ReportBuilderService } from '../services/report-builder.service';
import { IpfsService } from '../services/ipfs.service';
import { EmailService } from '../services/email.service';
import { ReportFormat } from '../entities/report-job.entity';
import { QUEUE_NAMES } from '../../queues/queue.constants';
import { Patient } from '../../patients/entities/patient.entity';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
@Processor(QUEUE_NAMES.REPORTS)
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);

  constructor(
    private readonly reportGenerationService: ReportGenerationService,
    private readonly reportBuilderService: ReportBuilderService,
    private readonly ipfsService: IpfsService,
    private readonly emailService: EmailService,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { jobId, patientId, format } = job.data;

    try {
      this.logger.log(`Processing report job: ${jobId}`);
      await this.reportGenerationService.markAsProcessing(jobId);

      const tempDir = path.join(process.cwd(), 'temp', 'reports');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const fileName = `report-${jobId}.${format}`;
      const filePath = path.join(tempDir, fileName);

      if (format === ReportFormat.PDF) {
        await this.reportBuilderService.generatePDF(patientId, filePath);
      } else {
        await this.reportBuilderService.generateCSV(patientId, filePath);
      }

      const ipfsHash = await this.ipfsService.uploadFile(filePath);
      fs.unlinkSync(filePath);

      await this.reportGenerationService.markAsCompleted(jobId, ipfsHash);

      // Fetch the completed job to get the download token, then email the patient.
      const completedJob = await this.reportGenerationService.getJobStatus(jobId);
      if (completedJob?.downloadUrl) {
        const patient = await this.patientRepository.findOne({ where: { id: patientId } });
        if (patient?.email) {
          // Extract the token from the download URL query string.
          const tokenMatch = completedJob.downloadUrl.match(/[?&]token=([^&]+)/);
          const downloadToken = tokenMatch ? tokenMatch[1] : '';
          await this.emailService.sendReportReadyEmail(patient.email, jobId, downloadToken);
        } else {
          this.logger.warn(
            `Report job ${jobId} completed but patient ${patientId} has no email address — skipping notification`,
          );
        }
      }

      this.logger.log(`Report job completed: ${jobId}`);
    } catch (error) {
      this.logger.error(`Report job failed: ${jobId}`, error.stack);
      await this.reportGenerationService.markAsFailed(jobId, error.message);
      throw error;
    }
  }
}
