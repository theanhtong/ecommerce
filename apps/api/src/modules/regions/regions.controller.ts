import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('regions')
export class RegionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('provinces')
  async provinces() {
    return this.prisma.province.findMany({
      select: { code: true, name: true, fullName: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('provinces/:code/wards')
  async wards(@Param('code') code: string) {
    const province = await this.prisma.province.findUnique({
      where: { code },
      select: {
        wards: {
          select: { code: true, name: true, fullName: true, type: true },
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!province) throw new NotFoundException('Province not found');
    return province.wards;
  }
}
