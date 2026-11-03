import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { Photo } from './entities';

const DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const MIMES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

@Controller('photos')
export class PhotosController {
  constructor(@InjectRepository(Photo) private readonly photos: Repository<Photo>) {}

  /** Idempotent raw-body upload: retrying the same photo id is safe. */
  @Put(':id')
  async upload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('inspectionId', new ParseUUIDPipe()) inspectionId: string,
    @Headers('x-user-id') userId: string,
    @Req() req: Request,
  ) {
    const mime = (req.headers['content-type'] ?? '').split(';')[0];
    if (!MIMES[mime]) throw new BadRequestException('only image/jpeg or image/png');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new BadRequestException('empty body');
    const b = req.body as Buffer;
    const magicOk =
      mime === 'image/jpeg'
        ? b[0] === 0xff && b[1] === 0xd8
        : b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (!magicOk) throw new BadRequestException('file content does not match its image type');
    await fs.mkdir(DIR, { recursive: true });
    const path = join(DIR, `${id}.${MIMES[mime]}`);
    await fs.writeFile(path, req.body);
    await this.photos.save({ id, inspectionId, mime, path, uploadedBy: userId });
    return { id, size: req.body.length };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const p = await this.photos.findOne({ where: { id } });
    if (!p) throw new NotFoundException();
    res.type(p.mime).send(await fs.readFile(p.path));
  }
}
