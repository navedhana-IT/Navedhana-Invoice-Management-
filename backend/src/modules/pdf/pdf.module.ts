import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { RenderDataService } from './render-data.service';

@Module({ providers: [PdfService, RenderDataService], exports: [PdfService, RenderDataService] })
export class PdfModule {}
