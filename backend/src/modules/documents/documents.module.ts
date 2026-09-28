import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module, NotFoundException, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { checkUpload, uploadLimits } from '../../common/uploads';
import { ReadOnlyRoute, RequirePermission, Tenant, TenantMember } from '../../common/decorators';
import type { Permission } from '../../common/permissions';
import { storageLimitBytes } from '../../common/plan-limits';
import { PrismaService } from '../../infra/prisma.service';
import { StorageService } from '../../infra/storage.service';
import type { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';
import { IdParam, IsId, type Id } from '../../common/ids';

const KINDS = ['LOGO', 'HEADER', 'FOOTER', 'SIGNATURE', 'OTHER'] as const;
const FOLDER: Record<(typeof KINDS)[number], string> = { LOGO: 'logos', HEADER: 'headers', FOOTER: 'footers', SIGNATURE: 'signatures', OTHER: 'documents' };

class UploadDto {
  @IsIn(KINDS) kind: (typeof KINDS)[number];
  @IsOptional() @IsId() serviceId?: Id;
}

class ListDto {
  @IsId() serviceId: Id;
}

class SignDto {
  @IsString() @MaxLength(500) key: string;
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @RequirePermission('service.update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: uploadLimits() }))
  async upload(@Tenant() t: TenantContext, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadDto) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    const ext = checkUpload(file);
    if (dto.serviceId) t.assertService('service.update', dto.serviceId);
    await this.assertStorage(t.companyId, file.size);

    const key = this.storage.key(t.companyId, FOLDER[dto.kind], `${randomUUID()}.${ext}`, dto.serviceId);
    await this.storage.put(key, file.buffer, file.mimetype);
    const doc = await this.prisma.document.create({
      data: { companyId: t.companyId, serviceId: dto.serviceId, kind: dto.kind, storageKey: key, fileName: file.originalname.slice(0, 200), mimeType: file.mimetype, size: file.size, createdById: t.userId },
    });
    await this.audit.log({ actor: t.actor, companyId: t.companyId, serviceId: dto.serviceId, action: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: doc.id, newValue: { kind: dto.kind, key } });
    return doc;
  }

  /** Uploaded images of a service, for the template builder's image picker. */
  @Get()
  @RequirePermission('service.view')
  async list(@Tenant() t: TenantContext, @Query() q: ListDto) {
    t.assertService('service.view', q.serviceId);
    return this.prisma.document.findMany({
      where: { companyId: t.companyId, serviceId: q.serviceId, kind: { in: [...KINDS] }, mimeType: { startsWith: 'image/' } },
      select: { id: true, kind: true, storageKey: true, fileName: true, size: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Short-lived signed URL. Invoice and receipt PDFs need invoice/payment view on their service. */
  @Get(':id/url')
  @TenantMember()
  async url(@Tenant() t: TenantContext, @IdParam() id: Id) {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId: t.companyId } });
    this.assertCanRead(t, doc);
    return { url: await this.storage.signedUrl(doc!.storageKey), expiresIn: 300 };
  }

  /** Signed URL by storage key (used for service logos). The key must be a document of this company the user may read. */
  @Post('sign')
  @ReadOnlyRoute()
  @TenantMember()
  async sign(@Tenant() t: TenantContext, @Body() body: SignDto) {
    const doc = await this.prisma.document.findFirst({ where: { storageKey: body.key, companyId: t.companyId } });
    this.assertCanRead(t, doc);
    return { url: await this.storage.signedUrl(body.key), expiresIn: 300 };
  }

  private assertCanRead(t: TenantContext, doc: { kind: string; serviceId: Id | null } | null) {
    const perm: Permission = doc?.kind === 'INVOICE_PDF' ? 'invoice.view' : doc?.kind === 'RECEIPT_PDF' ? 'payment.view' : 'service.view';
    const ok = doc && (doc.serviceId ? t.can(perm, doc.serviceId) : t.hasAny(perm));
    if (!ok) throw new NotFoundException('The requested file could not be found');
  }

  private async assertStorage(companyId: Id, adding: number) {
    const cap = await storageLimitBytes(this.prisma, companyId);
    if (cap == null) return;
    const used = (await this.prisma.document.aggregate({ where: { companyId }, _sum: { size: true } }))._sum.size ?? 0;
    if (used + adding > cap) throw new ForbiddenException(`Your plan's ${Math.round(cap / 1024 / 1024)} MB storage is full. Upgrade your plan or remove unused files.`);
  }
}

@Module({ controllers: [DocumentsController] })
export class DocumentsModule {}
