/**
 * KATEGORI AGACI API'SI.
 *
 * Sabit "brands/models/variants/packages" ucluleri yerine GENERIC gezinme:
 * kokler, bir dugumun DOGRUDAN cocuklari, atalar (breadcrumb) ve tam yol
 * cozumlemesi. Derinlik sozlesmede hicbir yerde gecmez.
 *
 * Tum agac tek seferde gonderilmez; UI adim adim ilerler.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { VehicleHierarchyService } from './vehicle-hierarchy.service';
import type { HierarchyNodeDto } from './vehicle-hierarchy.service';

@Controller('vehicle-hierarchy')
export class VehicleHierarchyController {
  constructor(private readonly hierarchy: VehicleHierarchyService) {}

  /** Kokler = markalar. */
  @Get('roots')
  getRoots(): HierarchyNodeDto[] {
    return this.hierarchy.getRoots();
  }

  /** Yalnizca verilen dugumun dogrudan cocuklari. */
  @Get('children')
  getChildren(@Query('parentId') parentId: string): HierarchyNodeDto[] {
    return this.hierarchy.getChildren(parentId);
  }

  /** Breadcrumb: kokten bu dugume kadar zincir. */
  @Get('ancestors')
  getAncestors(@Query('id') id: string): HierarchyNodeDto[] {
    return this.hierarchy.getAncestors(id);
  }

  /** "Audi/A3/A3 Sportback/35 TFSI/Advanced" -> dugum. */
  @Get('resolve')
  resolve(@Query('path') path: string): HierarchyNodeDto {
    const segments = String(path || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.hierarchy.resolvePath(segments);
  }

  @Get('stats')
  stats() {
    return this.hierarchy.stats();
  }

  /**
   * Dugum kimligi TAM YOLDAN turetildigi icin "/" ICERIR
   * ("audi/a3/a3-sportback/35-tfsi/advanced"). Bu yuzden yol parametresi
   * degil SORGU parametresi kullanilir; yoksa kimlik rota segmentlerine
   * bolunur ve dugum bulunamaz.
   */
  @Get('node')
  getNode(@Query('id') id: string): HierarchyNodeDto {
    return this.hierarchy.getNode(id);
  }
}
